"""VLM boundary: JPEG + question in, description out (Q3).

Direct Hugging Face transformers behind the seam — no agent framework,
no sidecar. Default model runs local on CPU (~1GB); VISION_MODEL_ID
env swaps it without code changes. The stack stays lazy so CI
collection never needs weights; tests patch describe_frame.
"""

from __future__ import annotations

import io
import logging
import os
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from transformers import AutoModelForImageTextToText, AutoProcessor

MODEL_ID = os.getenv("VISION_MODEL_ID", "LiquidAI/LFM2.5-VL-450M")
MAX_NEW_TOKENS = 64

logger = logging.getLogger(__name__)

_model: AutoModelForImageTextToText | None = None
_processor: AutoProcessor | None = None


def warmup() -> None:
    """Preload weights (server lifespan); lazy _load stays for tests."""
    _load()


def _load() -> tuple[AutoModelForImageTextToText, AutoProcessor]:
    global _model, _processor
    if _model is not None and _processor is not None:
        logger.debug("vlm cache hit")
        return _model, _processor
    from transformers import AutoModelForImageTextToText, AutoProcessor

    logger.info("vlm cache miss — loading %s", MODEL_ID)
    started = time.monotonic()
    _model = AutoModelForImageTextToText.from_pretrained(MODEL_ID)
    _processor = AutoProcessor.from_pretrained(MODEL_ID)
    logger.info("vlm loaded in %.1fs", time.monotonic() - started)
    return _model, _processor


async def describe_frame(image: bytes, question: str) -> str:
    from PIL import Image

    model, processor = _load()
    picture = Image.open(io.BytesIO(image)).convert("RGB")
    conversation = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": picture},
                {"type": "text", "text": question},
            ],
        }
    ]
    inputs = processor.apply_chat_template(
        conversation,
        add_generation_prompt=True,
        return_tensors="pt",
        return_dict=True,
        tokenize=True,
    ).to(model.device)
    output_ids = model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS)
    # ponytail: decode generated tokens only, not the echoed prompt
    generated = output_ids[0, inputs["input_ids"].shape[1]:]
    return str(processor.decode(generated, skip_special_tokens=True))
