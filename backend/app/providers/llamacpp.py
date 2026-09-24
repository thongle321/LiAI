"""Local GGUF chat: one lazy llama.cpp slot (ADR-006).

Mirrors the VLM boundary (app/shared/vlm.py): weights load lazily so CI
collection never needs them, inference runs in a worker thread, and a
module lock serializes the non-thread-safe Llama object. One difference:
the slot is keyed by path — serving a different file releases the
previous one — and the lock spans ensure+infer so a switch can never
answer on the wrong model. Plain chat only: create_tool_model stays
None, so talents never fire on local models.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING

from .base import ChatProvider

if TYPE_CHECKING:
    from llama_cpp import Llama

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_loaded_path: Path | None = None
_loaded: Llama | None = None


def _load(path: Path) -> Llama:
    from llama_cpp import Llama

    n_ctx = int(os.getenv("LLAMA_CTX", "4096"))
    n_gpu_layers = int(os.getenv("LLAMA_GPU_LAYERS", "0"))
    logger.info("llama slot miss — loading %s (ctx=%d)", path.name, n_ctx)
    return Llama(
        model_path=str(path),
        n_ctx=n_ctx,
        n_gpu_layers=n_gpu_layers,
        verbose=False,
    )


# Single loader seam: tests inject a fake model here instead of weights.
_loader: Callable[[Path], Llama] = _load


def _max_tokens() -> int:
    return int(os.getenv("LLAMA_MAX_TOKENS", "512"))


class LlamaCppChatProvider(ChatProvider):
    """A previously uploaded GGUF file, served from the single slot."""

    def __init__(self, model_path: Path) -> None:
        self._model_path = model_path
        self.model_name = model_path.name

    def create_tool_model(self) -> None:
        """No tool calling on local models (ADR-006): plain chat only."""

    async def reply(self, message: str) -> str:
        return await asyncio.to_thread(_chat_sync, self._model_path, message)


def _chat_sync(model_path: Path, message: str) -> str:
    # One critical section for ensure+infer: a concurrent switch must not
    # land between them and answer on the wrong model (single slot).
    with _lock:
        llm = _ensure(model_path)
        out = llm.create_chat_completion(
            messages=[{"role": "user", "content": message}],
            max_tokens=_max_tokens(),
        )
    if not isinstance(out, dict):
        raise TypeError(f"llama.cpp returned {type(out).__name__}, not a mapping")
    try:
        content = out["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("llama.cpp returned no text") from exc
    return str(content).strip()


def _ensure(model_path: Path) -> Llama:
    """Return the slot model, loading (and releasing the previous) as needed.

    Call with _lock held. The file check lives here too so direct users
    get FileNotFoundError instead of a loader crash (resolve() pre-checks
    for the route's 400).
    """
    global _loaded_path, _loaded
    if not model_path.is_file():
        raise FileNotFoundError(f"model file not found: {model_path.name}")
    if _loaded is not None and _loaded_path == model_path:
        return _loaded
    if _loaded is not None:
        logger.info("llama slot switch — releasing %s", _loaded_path)
        _loaded.close()
        _loaded = None
        _loaded_path = None
    _loaded = _loader(model_path)
    _loaded_path = model_path
    return _loaded
