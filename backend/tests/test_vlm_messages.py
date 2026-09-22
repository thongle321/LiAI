"""llama.cpp message seam: structure without weights (no GGUF download)."""

import base64
import io

from PIL import Image

from app.realtime import vlm


def _jpeg(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (0, 255, 0)).save(buf, format="JPEG")
    return buf.getvalue()


def test_chat_messages_carry_image_and_question() -> None:
    msgs = vlm._chat_messages(_jpeg(64, 64), "What do you see?")
    assert len(msgs) == 1 and msgs[0]["role"] == "user"
    parts = {p["type"]: p for p in msgs[0]["content"]}
    assert set(parts) == {"image_url", "text"}
    assert parts["text"]["text"] == "What do you see?"
    uri = parts["image_url"]["image_url"]["url"]
    assert uri.startswith("data:image/jpeg;base64,")
    raw = base64.b64decode(uri.split(",", 1)[1])
    assert raw[0:3] == b"\xff\xd8\xff"


def test_thumbnail_caps_long_edge() -> None:
    msgs = vlm._chat_messages(_jpeg(1600, 1200), "Describe what you see.")
    uri = msgs[0]["content"][0]["image_url"]["url"]
    thumb = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1])))
    assert max(thumb.size) <= vlm._max_edge()
