"""Contract tests: every backend error uses the {error: {code, message}} envelope."""

from conftest import assert_envelope
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_blank_message_is_invalid_request_envelope() -> None:
    resp = client.post("/api/chat", json={"message": "   "})
    assert resp.status_code == 422
    assert_envelope(resp.json(), "invalid_request")


def test_missing_message_is_invalid_request_envelope() -> None:
    resp = client.post("/api/chat", json={})
    assert resp.status_code == 422
    assert_envelope(resp.json(), "invalid_request")


def test_llm_failure_is_llm_error_envelope(broken_agent) -> None:  # type: ignore[no-untyped-def]
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 502
    assert_envelope(resp.json(), "llm_error")


def test_store_failure_is_store_error_envelope() -> None:  # type: ignore[no-untyped-def]
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
        resp = client.post("/api/chat", json={"message": "hi"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 503
    assert_envelope(resp.json(), "store_error")
