"""Vision WebSocket: JSON frame+question stream (Q4-Q6).

Fake-gated: VLM stubbed, synthetic JPEG, no camera/network/keys.
/api/chat untouched. Comprehension proven on-device live.
"""

import base64
import io

from collections.abc import Awaitable
from typing import TypeVar

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.realtime.vlm as vlm
from app.main import app
from app.memory import get_store

client = TestClient(app)


def _tiny_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(buf, format="JPEG")
    return buf.getvalue()


FAKE_JPEG = _tiny_jpeg()
FAKE_B64 = base64.b64encode(FAKE_JPEG).decode()


def _patch_vlm(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_describe(image: bytes, question: str) -> str:
        assert image == FAKE_JPEG
        return f"canned view for: {question}"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)


def test_question_returns_answer_with_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_vlm(monkeypatch)
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "frame", "jpeg": FAKE_B64})
        ws.send_json({"type": "question", "text": "What do you see?"})
        answer = ws.receive_json()
    assert answer["type"] == "answer"
    assert "canned view for: What do you see?" in answer["text"]
    assert isinstance(answer["session_id"], str) and answer["session_id"]


def test_bad_frame_is_rejected_safely() -> None:
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "frame", "jpeg": "!!!not-base64!!!"})
        msg = ws.receive_json()
    assert msg["type"] == "error"
    assert msg["error"]["code"] == "invalid_request"


def test_oversized_frame_is_rejected() -> None:
    big = base64.b64encode(FAKE_JPEG + bytes(2 * 1024 * 1024)).decode()
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "frame", "jpeg": big})
        msg = ws.receive_json()
    assert msg["type"] == "error"
    assert msg["error"]["code"] == "invalid_request"


def test_question_without_frame_reports_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_vlm(monkeypatch)
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "question", "text": "What do you see?"})
        msg = ws.receive_json()
    assert msg["type"] == "error"
    assert msg["error"]["code"] == "invalid_request"


def test_unknown_message_type_is_rejected() -> None:
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "teleport"})
        msg = ws.receive_json()
    assert msg["type"] == "error"
    assert msg["error"]["code"] == "invalid_request"


T = TypeVar("T")


def _run(coro: Awaitable[T]) -> T:
    import asyncio

    return asyncio.run(coro)


def test_text_chat_unaffected_by_vision() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"


def test_narration_tick_sends_caption_and_persists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_describe(image: bytes, question: str) -> str:
        assert image == FAKE_JPEG
        assert question == "Describe what you see."
        return "a red square"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)
    from app.realtime.ws import SocketState, narration_tick

    sent: list[dict] = []

    class FakeSocket:
        async def send_json(self, msg: dict) -> None:
            sent.append(msg)

    import asyncio

    state = SocketState(latest=FAKE_JPEG)
    _run(narration_tick(FakeSocket(), asyncio.Lock(), state))  # type: ignore[arg-type]
    assert len(sent) == 1
    assert sent[0]["type"] == "caption"
    assert "a red square" in sent[0]["text"]
    turns = get_store().get(sent[0]["session_id"])
    assert turns is not None and len(turns) == 1
    assert turns[0].role == "assistant"


def test_narration_tick_skips_when_busy_or_empty() -> None:
    import asyncio

    from app.realtime.ws import SocketState, narration_tick

    async def go() -> list[dict]:
        sent: list[dict] = []

        class FakeSocket:
            async def send_json(self, msg: dict) -> None:
                sent.append(msg)

        ws = FakeSocket()
        await narration_tick(ws, asyncio.Lock(), SocketState(latest=None))
        locked = asyncio.Lock()
        await locked.acquire()
        await narration_tick(ws, locked, SocketState(latest=FAKE_JPEG))
        return sent

    assert _run(go()) == []


def test_narration_interval_parsing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.realtime.ws import DEFAULT_NARRATION_INTERVAL, narration_interval

    monkeypatch.setenv("VISION_NARRATION_INTERVAL_SECONDS", "10")
    assert narration_interval() == 10.0
    monkeypatch.setenv("VISION_NARRATION_INTERVAL_SECONDS", "garbage")
    assert narration_interval() == DEFAULT_NARRATION_INTERVAL
    monkeypatch.setenv("VISION_NARRATION_INTERVAL_SECONDS", "0")
    assert narration_interval() == DEFAULT_NARRATION_INTERVAL
    monkeypatch.delenv("VISION_NARRATION_INTERVAL_SECONDS", raising=False)
    assert narration_interval() == DEFAULT_NARRATION_INTERVAL


def test_live_loop_captions_over_socket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_describe(image: bytes, question: str) -> str:
        return "live view"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)
    monkeypatch.setenv("VISION_NARRATION_INTERVAL_SECONDS", "1")
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "frame", "jpeg": FAKE_B64})
        msg = ws.receive_json()
    assert msg["type"] == "caption"
    assert "live view" in msg["text"]
