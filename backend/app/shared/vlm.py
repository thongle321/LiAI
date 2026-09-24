"""VLM boundary: JPEG + question in, description out.

llama.cpp via llama-cpp-python behind the seam — quantized GGUF
(LFM2.5-VL) on CPU instead of transformers. GGUF + mmproj download from
the Hub on first load; VISION_GGUF_REPO/_FILE/_MMPROJ_FILE/_GPU_LAYERS/
_CTX/_MAX_TOKENS/_MAX_EDGE swap them without code changes. The stack stays lazy so CI collection never needs weights;
tests patch describe_frame.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import threading
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from llama_cpp import Llama

# ponytail: env read at use time, never at import — .env autoload must
# win regardless of which module is imported first (config timing).
_GGUF_REPO_DEFAULT = "LiquidAI/LFM2.5-VL-450M-GGUF"
_GGUF_FILE_DEFAULT = "LFM2.5-VL-450M-Q4_K_M.gguf"
_MMPROJ_FILE_DEFAULT = "mmproj-LFM2.5-VL-450m-Q8_0.gguf"


def _max_edge() -> int:
    # ponytail: cap pixels before the handler — visual tokens dominate prefill
    return int(os.getenv("VISION_MAX_EDGE", "512"))


logger = logging.getLogger(__name__)

_llm: Llama | None = None

# llama-cpp Llama is not thread-safe: two concurrent
# create_chat_completion calls corrupt the decode batch
# ("sampling index is outside the most recent decode output batch").
# A cancelled narration thread keeps decoding while the question's
# inference starts, and ws.py locks are per-socket — so the boundary
# owning the shared object serializes it.
_infer_lock = threading.Lock()


def warmup() -> None:
    """Preload weights (server lifespan); lazy _load stays for tests."""
    _loader()


def _load() -> Llama:
    global _llm
    if _llm is not None:
        logger.debug("vlm cache hit")
        return _llm
    from huggingface_hub import hf_hub_download
    from llama_cpp import Llama
    from llama_cpp.llama_chat_format import LFM25VLChatHandler

    repo = os.getenv("VISION_GGUF_REPO", _GGUF_REPO_DEFAULT)
    filename = os.getenv("VISION_GGUF_FILE", _GGUF_FILE_DEFAULT)
    mmproj_file = os.getenv("VISION_MMPROJ_FILE", _MMPROJ_FILE_DEFAULT)
    # ponytail: CPU-only (0); set VISION_GPU_LAYERS=-1 with a CUDA runtime
    # on PATH for full GPU offload
    n_gpu_layers = int(os.getenv("VISION_GPU_LAYERS", "0"))
    # ponytail: 8192 covers 512px image tokens + question + short caption
    n_ctx = int(os.getenv("VISION_CTX", "8192"))

    logger.info("vlm cache miss — loading %s/%s", repo, filename)
    mmproj_path = hf_hub_download(repo_id=repo, filename=mmproj_file)
    handler = LFM25VLChatHandler(mmproj_path=mmproj_path, verbose=False)
    _llm = Llama.from_pretrained(
        repo_id=repo,
        filename=filename,
        chat_handler=handler,
        n_gpu_layers=n_gpu_layers,
        n_ctx=n_ctx,
        verbose=False,
    )
    logger.info("vlm loaded (gpu_layers=%d, ctx=%d)", n_gpu_layers, n_ctx)
    return _llm


# Single loader seam: tests inject a fake model here instead of
# reaching into _load/_describe_sync internals.
_loader: Callable[[], Llama] = _load


def _thumbnail_jpeg(image: bytes) -> bytes:
    from PIL import Image

    picture = Image.open(io.BytesIO(image)).convert("RGB")
    edge = _max_edge()
    picture.thumbnail((edge, edge))
    buf = io.BytesIO()
    picture.save(buf, format="JPEG")
    return buf.getvalue()


def _chat_messages(image: bytes, question: str) -> list[dict[str, Any]]:
    """Pure message builder (no weights) — the unit-testable seam."""
    data_uri = (
        "data:image/jpeg;base64," + base64.b64encode(_thumbnail_jpeg(image)).decode()
    )
    return [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_uri}},
                {"type": "text", "text": question},
            ],
        }
    ]


async def describe_frame(image: bytes, question: str) -> str:
    """Non-blocking wrapper: sync llama.cpp work runs in a worker thread.

    Inference must not block the event loop, or the socket's ping/pong
    goes unanswered and the client times out (1006).
    """
    return await asyncio.to_thread(_describe_sync, image, question)


def _describe_sync(image: bytes, question: str) -> str:
    llm = _loader()
    # ponytail: 32 tokens halves generation time vs 64; captions stay one sentence
    max_tokens = int(os.getenv("VISION_MAX_TOKENS", "32"))
    with _infer_lock:
        out = llm.create_chat_completion(
            messages=_chat_messages(image, question),
            max_tokens=max_tokens,
        )
    return str(out["choices"][0]["message"]["content"]).strip()
