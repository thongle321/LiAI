"""Session management routes: list/create/rename/pin/delete + title derivation.

The module-global memory store is shared across this pytest process, so
every test creates its own sessions and asserts on those ids only.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.modules.companion import SESSION_TITLE_LEN

client = TestClient(app)


def _create_session() -> dict[str, object]:
    resp = client.post("/api/sessions")
    assert resp.status_code == 201
    body = resp.json()
    assert isinstance(body["id"], str) and body["id"]
    return body


def _listed_ids() -> set[str]:
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    return {s["id"] for s in resp.json()["sessions"]}


def _find(session_id: str) -> dict[str, object]:
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    for entry in resp.json()["sessions"]:
        if entry["id"] == session_id:
            return entry
    raise AssertionError(f"session {session_id} missing from list")


def test_sessions_create_and_list() -> None:
    created = _create_session()
    assert created["title"] == ""
    assert created["pinned"] is False
    assert isinstance(created["updated_at"], str) and created["updated_at"]
    assert created["id"] in _listed_ids()


def test_session_title_from_first_turn() -> None:
    resp = client.post("/api/chat", json={"message": "hello world title"})
    assert resp.status_code == 200
    sid = str(resp.json()["session_id"])
    assert _find(sid)["title"] == "hello world title"


def test_session_title_truncated_to_limit() -> None:
    long_text = "x" * (SESSION_TITLE_LEN + 20)
    resp = client.post("/api/chat", json={"message": long_text})
    assert resp.status_code == 200
    sid = str(resp.json()["session_id"])
    assert _find(sid)["title"] == "x" * SESSION_TITLE_LEN


def test_session_title_sticks_from_first_turn() -> None:
    resp = client.post("/api/chat", json={"message": "first words"})
    assert resp.status_code == 200
    sid = str(resp.json()["session_id"])
    resp = client.post("/api/chat", json={"message": "second words", "session_id": sid})
    assert resp.status_code == 200
    assert _find(sid)["title"] == "first words"


def test_session_rename_and_pin_orders_pinned_first() -> None:
    first = _create_session()
    second = _create_session()
    resp = client.patch(
        f"/api/sessions/{first['id']}", json={"title": "Renamed", "pinned": True}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Renamed"
    assert body["pinned"] is True
    listed = client.get("/api/sessions").json()["sessions"]
    own = [s for s in listed if s["id"] in (first["id"], second["id"])]
    assert [s["id"] for s in own] == [first["id"], second["id"]]


def test_session_update_validation() -> None:
    created = _create_session()
    assert client.patch(f"/api/sessions/{created['id']}", json={}).status_code == 422
    assert (
        client.patch(f"/api/sessions/{created['id']}", json={"title": ""}).status_code
        == 422
    )
    resp = client.patch(f"/api/sessions/{created['id']}", json={"pinned": False})
    assert resp.status_code == 200
    assert client.patch("/api/sessions/nope", json={"title": "x"}).status_code == 404
    assert client.patch("/api/sessions/nope", json={"pinned": True}).status_code == 404


def test_session_delete() -> None:
    created = _create_session()
    assert created["id"] in _listed_ids()
    resp = client.delete(f"/api/sessions/{created['id']}")
    assert resp.status_code == 200
    assert created["id"] not in _listed_ids()
    assert client.delete(f"/api/sessions/{created['id']}").status_code == 404
    # History for a deleted session mints fresh, like unknown ids.
    resp = client.get("/api/history", params={"session_id": str(created["id"])})
    assert resp.status_code == 200
    assert resp.json()["session_id"] != created["id"]


def test_history_carries_tool_metadata_when_present(tool_agent) -> None:  # type: ignore[no-untyped-def]
    resp = client.post("/api/chat", json={"message": "what time is it?"})
    assert resp.status_code == 200
    sid = str(resp.json()["session_id"])
    resp = client.get("/api/history", params={"session_id": sid})
    assert resp.status_code == 200
    assistant = [m for m in resp.json()["messages"] if m["role"] == "assistant"]
    assert len(assistant) == 1
    assert assistant[0]["metadata"]["tool_calls"] == ["get_current_time"]
    (runs,) = assistant[0]["metadata"]["tool_runs"]
    assert runs["name"] == "get_current_time" and runs["input"] == {}
    assert isinstance(runs["result"], str) and runs["result"]
