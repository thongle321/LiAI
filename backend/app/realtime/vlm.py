"""VLM boundary: JPEG + question in, description out (Q3).

Direct Hugging Face transformers behind the seam — no agent framework,
no sidecar. LFM2.5-VL-450M runs local on CPU (~1GB). The model stays
lazy so CI collection never needs weights; tests patch describe_frame.
"""

from __future__ import annotations

import io

MODEL_ID = "LiquidAI/LFM2.5-VL-450M"
MAX_NEW_TOKENS = 64

_model = None
_processor = None


def _load() -> tuple[object, object]:
    global _model, _processor
    if _model is None:
        from transformers import AutoModelForImageTextToText, AutoProcessor

        _model = AutoModelForImageTextToText.from_pretrained(MODEL_ID)
        _processor = AutoProcessor.from_pretrained(MODEL_ID)
    assert _processor is not None
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
