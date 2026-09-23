"""History tests: GET /api/history returns stored turns, forgiving session lifecycle."""

import pytest
from fastapi.testclient import TestClient
from test_contract import assert_envelope

from app.main import app

client = TestClient(app)


def _chat_turns() -> str:
    resp = client.post("/api/chat", json={"message": "hist one"})
    sid = resp.json()["session_id"]
    client.post("/api/chat", json={"message": "hist two", "session_id": sid})
    return str(sid)


def test_history_returns_chat_turns_chronological() -> None:
    sid = _chat_turns()
    resp = client.get("/api/history", params={"session_id": sid})
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == sid
    assert body["messages"] == [
        {"role": "user", "content": "hist one"},
        {"role": "assistant", "content": "Echo: hist one"},
        {"role": "user", "content": "hist two"},
        {"role": "assistant", "content": "Echo: hist two"},
    ]


def test_history_missing_session_id_is_fresh_empty() -> None:
    resp = client.get("/api/history")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["session_id"], str) and body["session_id"]
    assert body["messages"] == []


def test_history_unknown_session_id_is_fresh_empty() -> None:
    resp = client.get("/api/history", params={"session_id": "nope"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] != "nope"
    assert body["messages"] == []


def test_history_store_failure_is_store_error_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.companion import get_store

    class BrokenStore:
        def get(self, session_id: str) -> object:
            raise RuntimeError("db down")

        def create(self) -> str:
            raise RuntimeError("db down")

        def append(self, session_id: str, turn: object) -> None:
            raise RuntimeError("db down")

    app.dependency_overrides[get_store] = lambda: BrokenStore()
    try:
        resp = client.get("/api/history", params={"session_id": "x"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 503
    assert_envelope(resp.json(), "store_error")
