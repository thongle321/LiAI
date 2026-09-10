import dataclasses

from fastapi.testclient import TestClient

from app.agents.companion import to_message_history
from app.main import app
from app.memory import InMemoryConversationStore, Turn, get_store

client = TestClient(app)


def test_first_turn_mints_session_id() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == "Echo: hi"
    assert isinstance(body["session_id"], str) and body["session_id"] != ""


def test_second_turn_continues_session() -> None:
    first = client.post("/api/chat", json={"message": "one"}).json()
    second = client.post(
        "/api/chat",
        json={"message": "two", "session_id": first["session_id"]},
    ).json()
    assert second["session_id"] == first["session_id"]
    assert second["reply"] == "Echo: two"
    assert len(get_store().get(first["session_id"] or "")) == 4


def test_unknown_session_id_starts_fresh() -> None:
    resp = client.post(
        "/api/chat", json={"message": "hi", "session_id": "no-such-session"}
    )
    assert resp.status_code == 200
    assert resp.json()["session_id"] != "no-such-session"


def test_sliding_window_caps_at_100_messages() -> None:
    store = InMemoryConversationStore()
    sid = store.create()
    for i in range(120):
        store.append(sid, Turn(role="user", content=f"m{i}"))
    turns = store.get(sid)
    assert turns is not None and len(turns) == 100
    assert turns[0].content == "m20"


def test_turns_are_framework_agnostic() -> None:
    assert {f.name for f in dataclasses.fields(Turn)} == {"role", "content"}


def test_adapter_converts_turns_to_history() -> None:
    history = to_message_history(
        [Turn(role="user", content="hi"), Turn(role="assistant", content="yo")]
    )
    assert len(history) == 2
    assert history[0].parts[0].content == "hi"
    assert history[1].parts[0].content == "yo"
