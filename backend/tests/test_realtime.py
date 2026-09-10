"""Realtime vision slice: fake-gated plumbing (Q14).

No camera/network/keys/weights in CI. The VLM call is stubbed;
comprehension is proven only in the manual live run. Frame capture
lives in Vision Agents (frame_buffer_seconds); LatestFrameBuffer was
removed as a duplicate of it.
"""

from collections.abc import Awaitable

import pytest
from fastapi.testclient import TestClient

import app.main as main
import app.realtime.vlm as vlm
from app.main import app
from app.memory import get_store

client = TestClient(app)


def test_token_endpoint_mints_structured_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        main, "mint_realtime_token", lambda: ("fake-token", "call-1", "caller-1")
    )
    resp = client.post("/api/realtime/token")
    assert resp.status_code == 200
    body = resp.json()
    assert body["token"] == "fake-token"
    assert body["call_id"] == "call-1"
    assert body["user_id"] == "caller-1"
    assert "api_key" in body
    assert "session_id" not in body


def test_token_factory_failure_is_internal_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken() -> tuple[str, str, str]:
        raise RuntimeError("edge down")

    monkeypatch.setattr(main, "mint_realtime_token", broken)
    resp = client.post("/api/realtime/token")
    assert resp.status_code == 500
    assert resp.json()["error"]["code"] == "internal_error"


def test_frame_question_flows_to_stored_reply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_ask(question: str) -> str:
        return f"canned view for: {question}"

    monkeypatch.setattr(vlm, "ask_view", fake_ask)
    from app.realtime.qa import answer_about_view

    reply, session_id = _run(answer_about_view("What do you see?"))
    assert "canned view for: What do you see?" in reply
    turns = get_store().get(session_id)
    assert turns is not None and len(turns) == 2
    assert turns[0].role == "user" and turns[1].role == "assistant"
    assert turns[1].content == reply


def test_frame_question_with_blank_question_fails_safely(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def must_not_run(question: str) -> str:
        raise AssertionError("VLM must not see empty questions")

    monkeypatch.setattr(vlm, "ask_view", must_not_run)
    from app.realtime.qa import answer_about_view

    with pytest.raises(ValueError):
        _run(answer_about_view("   "))


def test_text_chat_unaffected_by_realtime() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"


def _run(coro: Awaitable[tuple[str, str]]) -> tuple[str, str]:
    import asyncio

    return asyncio.run(coro)
