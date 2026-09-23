"""VLM serialization: llama-cpp Llama is not thread-safe.

Concurrent create_chat_completion calls from two to_thread workers
corrupt the decode batch — production symptom:
"RuntimeError: Llama.generate: sampling index is outside the most
recent decode output batch". describe_frame must serialize callers.
"""

import asyncio
import io
import threading
import time

import pytest
from PIL import Image

from app.shared import vlm


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(buf, format="JPEG")
    return buf.getvalue()


class OverlappingLlama:
    """Stands in for the real Llama: records concurrent entry instead
    of crashing like llama.cpp does."""

    def __init__(self) -> None:
        self.live = 0
        self.max_live = 0
        self._guard = threading.Lock()

    def create_chat_completion(self, **kwargs: object) -> dict:
        with self._guard:
            self.live += 1
            self.max_live = max(self.max_live, self.live)
        try:
            time.sleep(0.1)  # widen the race window (real decode is slower)
            return {"choices": [{"message": {"content": "a red square"}}]}
        finally:
            with self._guard:
                self.live -= 1


def test_concurrent_describe_frame_calls_are_serialized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = OverlappingLlama()
    monkeypatch.setattr(vlm, "_loader", lambda: fake)
    jpeg = _jpeg()

    async def go() -> None:
        await asyncio.gather(
            vlm.describe_frame(jpeg, "What?"),
            vlm.describe_frame(jpeg, "Describe what you see."),
        )

    asyncio.run(go())
    assert fake.max_live == 1
