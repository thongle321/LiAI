"""Vision WebSocket: JSON frame+question stream (Q4-Q6).

Fake-gated: VLM stubbed, synthetic JPEG, no camera/network/keys.
/api/chat untouched. Comprehension proven on-device live.
"""

import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.realtime.vlm as vlm
from app.main import app

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


def test_text_chat_unaffected_by_vision() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"
