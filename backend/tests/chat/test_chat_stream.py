"""Chat streaming tests: POST /api/chat with stream:true speaks SSE.

Event contract: start {session_id} first, token {text} deltas, tool {name}
per invoked tool, usage {…}, done {} last. Mid-stream failures surface as
an error event (the status line is already sent); pre-stream failures keep
their JSON status codes.
"""

import json

from conftest import assert_envelope
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _events(body: str) -> list[tuple[str, dict[str, object]]]:
    out: list[tuple[str, dict[str, object]]] = []
    for chunk in body.split("\n\n"):
        if not chunk.strip():
            continue
        name = text = ""
        for line in chunk.splitlines():
            if line.startswith("event: "):
                name = line[len("event: ") :]
            elif line.startswith("data: "):
                text = line[len("data: ") :]
        out.append((name, json.loads(text)))
    return out


def test_stream_sends_start_tokens_done() -> None:
    resp = client.post("/api/chat", json={"message": "hi", "stream": True})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _events(resp.text)
    assert events[0][0] == "start"
    sid = events[0][1]["session_id"]
    assert isinstance(sid, str) and sid
    assert events[-1] == ("done", {"session_id": sid})
    text = "".join(str(e[1]["text"]) for e in events if e[0] == "token")
    assert text == "Echo: hi"
    # The streamed turn persisted like a JSON turn.
    hist = client.get("/api/history", params={"session_id": str(sid)})
    assert [m["content"] for m in hist.json()["messages"]] == ["hi", "Echo: hi"]


def test_stream_without_flag_stays_json() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json()["reply"] == "Echo: hi"


def test_stream_tool_and_usage_events(tool_agent) -> None:  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/chat", json={"message": "what time is it?", "stream": True}
    )
    assert resp.status_code == 200
    events = _events(resp.text)
    kinds = [name for name, _ in events]
    assert kinds[0] == "start"
    assert kinds[-1] == "done"
    assert ("tool", {"name": "get_current_time"}) in events
    usage = [payload for name, payload in events if name == "usage"]
    assert len(usage) == 1
    assert set(usage[0]) == {"prompt_tokens", "completion_tokens", "total_tokens"}
    text = "".join(str(e[1]["text"]) for e in events if e[0] == "token")
    assert "The time is" in text


def test_stream_image_is_single_token(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import base64
    import io

    from PIL import Image

    from app.shared import vlm as vlm_module

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(buf, format="JPEG")
    payload = base64.b64encode(buf.getvalue()).decode()

    async def fake_describe(image: bytes, question: str) -> str:
        return "a red mug"

    monkeypatch.setattr(vlm_module, "describe_frame", fake_describe)
    resp = client.post(
        "/api/chat",
        json={"message": "what is this?", "image": payload, "stream": True},
    )
    assert resp.status_code == 200
    events = _events(resp.text)
    assert [name for name, _ in events] == ["start", "token", "usage", "done"]
    assert events[1] == ("token", {"text": "a red mug"})


def test_stream_retry_regenerates_last_answer() -> None:
    first = client.post("/api/chat", json={"message": "say apples"})
    assert first.status_code == 200
    sid = str(first.json()["session_id"])
    resp = client.post(
        "/api/chat", json={"session_id": sid, "retry": True, "stream": True}
    )
    assert resp.status_code == 200
    events = _events(resp.text)
    assert events[0][0] == "start"
    sid = str(events[0][1]["session_id"])
    assert events[-1] == ("done", {"session_id": sid})
    hist = client.get("/api/history", params={"session_id": sid}).json()["messages"]
    # Old assistant turn dropped, question asked once, fresh answer stored.
    assert [m["content"] for m in hist] == ["say apples", "Echo: say apples"]


def test_stream_retry_with_message_is_rejected() -> None:
    resp = client.post(
        "/api/chat",
        json={"session_id": "x", "retry": True, "message": "hi", "stream": True},
    )
    assert resp.status_code == 422
    assert_envelope(resp.json(), "invalid_request")


def test_retry_without_stream_is_rejected() -> None:
    resp = client.post("/api/chat", json={"session_id": "x", "retry": True})
    assert resp.status_code == 422
    assert_envelope(resp.json(), "invalid_request")


def test_stream_retry_without_history_is_rejected() -> None:
    resp = client.post(
        "/api/chat", json={"session_id": "nope", "retry": True, "stream": True}
    )
    assert resp.status_code == 400
    assert_envelope(resp.json(), "invalid_request")


def test_stream_broken_agent_emits_error_event(broken_agent) -> None:  # type: ignore[no-untyped-def]
    resp = client.post("/api/chat", json={"message": "hi", "stream": True})
    assert resp.status_code == 200
    events = _events(resp.text)
    assert events[0][0] == "start"
    errors = [payload for name, payload in events if name == "error"]
    assert len(errors) == 1
    assert errors[0]["code"] == "llm_error"
    # The question persisted before the failure; regenerate can answer it.
    sid = str(events[0][1]["session_id"])
    hist = client.get("/api/history", params={"session_id": sid}).json()["messages"]
    assert [m["content"] for m in hist] == ["hi"]


def test_stream_store_failure_is_503() -> None:
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
        resp = client.post("/api/chat", json={"message": "hi", "stream": True})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 503
    assert_envelope(resp.json(), "store_error")
