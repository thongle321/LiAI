"""Contract tests: every backend error uses the {error: {code, message}} envelope."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def assert_envelope(resp_json: object, code: str) -> None:
    assert isinstance(resp_json, dict)
    err = resp_json["error"]
    assert err["code"] == code
    assert isinstance(err["message"], str) and err["message"]


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


def test_store_failure_is_store_error_envelope(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import app.main as main

    class BrokenStore:
        def get(self, session_id: str) -> object:
            raise RuntimeError("db down")

        def create(self) -> str:
            raise RuntimeError("db down")

        def append(self, session_id: str, turn: object) -> None:
            raise RuntimeError("db down")

    monkeypatch.setattr(main, "get_store", lambda: BrokenStore())
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 503
    assert_envelope(resp.json(), "store_error")
