"""Vision WebSocket: JSON frame+question stream (Q4-Q6).

Fake-gated: VLM stubbed, synthetic JPEG, no camera/network/keys.
/api/chat untouched. Comprehension proven on-device live.
"""

import base64
import io
from collections.abc import Coroutine
from typing import Any, TypeVar

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.modules.companion import get_store
from app.shared import vlm

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


def _run(coro: Coroutine[Any, Any, T]) -> T:
    import asyncio

    return asyncio.run(coro)


def test_text_chat_unaffected_by_vision() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"


def test_startup_preloads_vlm_weights(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.shared.vlm as vlm_module
    from app.main import app as app_module
    from app.providers.factory import clear_provider_cache

    # Lifespan fails fast without a key; prove warmup with a dummy one.
    clear_provider_cache()
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    loaded = False

    def fake_load() -> None:
        nonlocal loaded
        loaded = True

    monkeypatch.setattr(vlm_module, "_loader", fake_load)
    # conftest no-ops warmup; restore the real one to prove lifespan calls it
    monkeypatch.setattr(vlm_module, "warmup", lambda: vlm_module._loader())
    _run(_enter_lifespan(app_module))
    assert loaded


async def _enter_lifespan(app: object) -> None:
    from app.main import lifespan

    gen = lifespan(app)  # type: ignore[operator]
    await gen.__aenter__()
    await gen.__aexit__(None, None, None)


def test_lifespan_boots_with_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.main import app as app_module
    from app.providers.factory import clear_provider_cache

    clear_provider_cache()
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    _run(_enter_lifespan(app_module))


def test_lifespan_fails_fast_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from pydantic_ai.exceptions import UserError

    from app.main import app as app_module
    from app.modules.companion import agent_dependency
    from app.providers.factory import clear_provider_cache

    # Drop the autouse echo override: lifespan builds via the genuine factory.
    monkeypatch.setitem(
        app_module.dependency_overrides, agent_dependency, lambda: None
    )
    monkeypatch.delitem(app_module.dependency_overrides, agent_dependency)
    clear_provider_cache()
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    try:
        _run(_enter_lifespan(app_module))
    except UserError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)
    else:
        raise AssertionError("expected UserError")


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, msg: dict) -> None:
        self.sent.append(msg)


def test_narration_tick_sends_caption_and_persists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_describe(image: bytes, question: str) -> str:
        assert image == FAKE_JPEG
        assert question == "Describe what you see."
        return "a red square"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)
    import asyncio

    from app.modules.vision.internal.ws import SocketState, narration_tick

    ws = FakeSocket()
    state = SocketState(latest=FAKE_JPEG)
    _run(narration_tick(ws, asyncio.Lock(), state))  # type: ignore[arg-type]
    assert len(ws.sent) == 1
    assert ws.sent[0]["type"] == "caption"
    assert "a red square" in ws.sent[0]["text"]
    turns = get_store().get(ws.sent[0]["session_id"])
    assert turns is not None and len(turns) == 1
    assert turns[0].role == "assistant"


def test_send_on_closing_socket_is_clean_exit() -> None:
    """Exiting the Vision tab races frames against the closing handshake:
    sends must report False, never raise (no ASGI traceback)."""
    from fastapi import WebSocketDisconnect

    from app.modules.vision.internal.ws import send_error, send_json

    class ClosingSocket:
        async def send_json(self, msg: dict) -> None:
            raise WebSocketDisconnect(code=1006)

    async def go() -> tuple[bool, bool]:
        ws = ClosingSocket()
        return await send_json(ws, {"type": "answer"}), await send_error(ws, "bad frame")  # type: ignore[arg-type]

    assert _run(go()) == (False, False)


def test_describe_frame_keeps_loop_responsive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """1006 regression: sync torch inference must not block the event
    loop, or the phone's socket times out with no ping/pong answered."""
    import time

    import app.shared.vlm as vlm_module

    class SlowLlama:
        def create_chat_completion(self, **kwargs: object) -> dict:
            time.sleep(0.5)
            return {"choices": [{"message": {"content": "slow view"}}]}

    monkeypatch.setattr(vlm_module, "_loader", lambda: SlowLlama())

    async def go() -> tuple[int, float]:
        import asyncio
        import time

        beats = 0

        async def heartbeat() -> None:
            nonlocal beats
            for _ in range(5):
                await asyncio.sleep(0.1)
                beats += 1

        started = time.monotonic()
        caption = await asyncio.gather(
            vlm_module.describe_frame(FAKE_JPEG, "What?"), heartbeat()
        )
        assert caption[0] == "slow view"
        return beats, time.monotonic() - started

    # Blocking loop: 0.5s frozen + 0.5s heartbeat = >=1.0s.
    # Worker thread: both run together ~= 0.5s.
    beats, elapsed = _run(go())
    assert beats == 5
    assert elapsed < 0.9


def test_narration_tick_survives_vlm_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    async def flaky_describe(image: bytes, question: str) -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("VLM exploded")
        return "recovered view"

    monkeypatch.setattr(vlm, "describe_frame", flaky_describe)
    from app.modules.vision.internal.ws import SocketState, narration_tick

    async def two_ticks() -> FakeSocket:
        import asyncio

        ws = FakeSocket()
        state = SocketState(latest=FAKE_JPEG)
        lock = asyncio.Lock()
        await narration_tick(ws, lock, state)  # type: ignore[arg-type]
        assert state.narration is None
        await narration_tick(ws, lock, state)  # type: ignore[arg-type]
        return ws

    ws = _run(two_ticks())
    assert [m["type"] for m in ws.sent] == ["caption"]
    assert "recovered view" in ws.sent[0]["text"]


def test_narration_tick_skips_when_busy_or_empty() -> None:
    import asyncio

    from app.modules.vision.internal.ws import SocketState, narration_tick

    async def run_skips() -> list[dict]:
        ws = FakeSocket()
        await narration_tick(ws, asyncio.Lock(), SocketState(latest=None))  # type: ignore[arg-type]
        locked = asyncio.Lock()
        await locked.acquire()
        await narration_tick(ws, locked, SocketState(latest=FAKE_JPEG))  # type: ignore[arg-type]
        return ws.sent

    assert _run(run_skips()) == []


def test_live_loop_captions_over_socket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_describe(image: bytes, question: str) -> str:
        return "live view"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "frame", "jpeg": FAKE_B64})
        msg = ws.receive_json()
    assert msg["type"] == "caption"
    assert "live view" in msg["text"]


def test_duplicate_captions_send_but_persist_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_describe(image: bytes, question: str) -> str:
        return "a red square"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)
    from app.modules.vision.internal.ws import SocketState, narration_tick

    async def run_two_ticks() -> tuple[FakeSocket, SocketState]:
        import asyncio

        ws = FakeSocket()
        state = SocketState(latest=FAKE_JPEG)
        lock = asyncio.Lock()
        await narration_tick(ws, lock, state)  # type: ignore[arg-type]
        await narration_tick(ws, lock, state)  # type: ignore[arg-type]
        return ws, state

    ws, state = _run(run_two_ticks())
    assert [m["type"] for m in ws.sent] == ["caption", "caption"]
    assert state.session_id is not None
    turns = get_store().get(state.session_id)
    assert turns is not None and len(turns) == 1


def test_question_preempts_inflight_narration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import threading
    import time

    started = threading.Event()
    release = threading.Event()

    async def slow_describe(image: bytes, question: str) -> str:
        if question == "Describe what you see.":
            started.set()
            # ponytail: blocking wait on a threading event keeps the app-loop
            # test honest — the caption genuinely never finishes on its own
            while not release.is_set():
                import asyncio

                await asyncio.sleep(0.01)
            return "stale caption"
        return f"canned view for: {question}"

    monkeypatch.setattr(vlm, "describe_frame", slow_describe)
    with client.websocket_connect("/api/vision/ws") as ws:
        ws.send_json({"type": "frame", "jpeg": FAKE_B64})
        assert started.wait(timeout=10)
        time.sleep(0.2)  # let the tick enter its blocked await
        ws.send_json({"type": "question", "text": "What do you see?"})
        # Answer must arrive while the narration is still blocked: the
        # question preempted it instead of queueing behind it.
        first = ws.receive_json()
        release.set()
        # Loop resumed after preemption: the next tick captions again.
        resumed = ws.receive_json()
    assert first["type"] == "answer"
    assert "canned view for: What do you see?" in first["text"]
    assert resumed["type"] == "caption"
    assert "stale caption" in resumed["text"]
