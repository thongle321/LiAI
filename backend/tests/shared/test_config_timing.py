"""Config read timing: env read at use, not at import.

Import-order hazard: binding VISION_* at module import froze values
before .env autoloaded when vlm was imported ahead of the provider
factory. Reads must happen when the values are used.
"""

import io

from PIL import Image

from app.shared import vlm


def _jpeg(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (0, 255, 0)).save(buf, format="JPEG")
    return buf.getvalue()


def _thumb(uri: str) -> Image.Image:
    import base64

    return Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1])))


def test_vision_env_read_at_use_time(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("VISION_MAX_EDGE", "64")
    msgs = vlm._chat_messages(_jpeg(1600, 1200), "Describe what you see.")
    uri = msgs[0]["content"][0]["image_url"]["url"]
    assert max(_thumb(uri).size) <= 64


def test_vision_env_defaults_when_unset(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.delenv("VISION_MAX_EDGE", raising=False)
    msgs = vlm._chat_messages(_jpeg(1600, 1200), "Describe what you see.")
    uri = msgs[0]["content"][0]["image_url"]["url"]
    assert max(_thumb(uri).size) <= 512
