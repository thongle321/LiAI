"""Chat search credentials: validation, talent e2e, no-leak (Wave 2).

The `search` body object carries per-request BYOK creds to the talent
loop (ADR-004: transient, never stored or logged). The web_search talent
itself is faked at the search_web seam — provider HTTP stays stubbed.
"""

import json

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from app.main import app
from app.modules.companion import agent_dependency, latest_user_text

client = TestClient(app)

SEARCH = {"provider": "tavily", "key": "secret-key", "count": 3}


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


def _search_override(monkeypatch: pytest.MonkeyPatch) -> None:
    """Route /api/chat through a web_search-calling fake (real tool machinery)."""
    from conftest import EchoProvider

    from app.modules.companion import get_companion_agent as build_agent

    async def run(messages: list[ModelMessage], _info: AgentInfo) -> ModelResponse:
        for message in reversed(messages):
            for part in message.parts:
                if isinstance(part, ToolReturnPart):
                    return ModelResponse(parts=[TextPart(f"Found: {part.content}")])
        if "search" in latest_user_text(messages).lower():
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="web_search", args={"query": "q"}, tool_call_id="w1"
                    )
                ]
            )
        raise AssertionError("fake model only handles search questions")

    async def stream(messages: list[ModelMessage], _info: AgentInfo):
        for message in reversed(messages):
            for part in message.parts:
                if isinstance(part, ToolReturnPart):
                    yield f"Found: {part.content}"
                    return
        if "search" in latest_user_text(messages).lower():
            yield {
                0: DeltaToolCall(
                    name="web_search", json_args='{"query": "q"}', tool_call_id="w1"
                )
            }
            return
        raise AssertionError("fake model only handles search questions")

    provider = EchoProvider()
    provider.create_tool_model = lambda: FunctionModel(run, stream_function=stream)  # type: ignore[method-assign]

    def factory() -> object:
        return build_agent(provider)

    monkeypatch.setitem(app.dependency_overrides, agent_dependency, factory)


def _fake_search_web(provider: str, key: str, query: str, count: int):
    from app.modules.search import SearchResult

    assert (provider, key, query, count) == ("tavily", "secret-key", "q", 3)
    return [SearchResult(title="T", url="https://t.example", snippet="s")]


def test_search_object_passes_validation() -> None:
    resp = client.post("/api/chat", json={"message": "hi", "search": SEARCH})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"


@pytest.mark.parametrize(
    "search",
    [
        {"provider": "exa", "key": "k", "count": 3},
        {"provider": "tavily", "key": "  ", "count": 3},
        {"provider": "tavily", "key": "k", "count": 0},
        {"provider": "brave", "key": "k", "count": 99},
        {"provider": "tavily", "count": 3},
    ],
)
def test_search_object_rejects_garbage(search: dict) -> None:
    resp = client.post("/api/chat", json={"message": "hi", "search": search})
    assert resp.status_code == 422


def test_search_stream_runs_talent_and_pairs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _search_override(monkeypatch)
    monkeypatch.setattr(
        "app.modules.companion.internal.tools.web_search.search_web", _fake_search_web
    )
    resp = client.post(
        "/api/chat", json={"message": "search for q", "stream": True, "search": SEARCH}
    )
    assert resp.status_code == 200
    assert "secret-key" not in resp.text
    tools = [payload for name, payload in _events(resp.text) if name == "tool"]
    assert [t["status"] for t in tools] == ["running", "done"]
    assert [t["id"] for t in tools] == ["w1", "w1"]
    assert tools[0]["input"] == {"query": "q"}
    assert "Untrusted content from" in str(tools[1].get("result"))
    text = "".join(
        str(payload["text"]) for name, payload in _events(resp.text) if name == "token"
    )
    assert "Found:" in text


def test_search_json_persists_runs_without_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.companion import get_store

    _search_override(monkeypatch)
    monkeypatch.setattr(
        "app.modules.companion.internal.tools.web_search.search_web", _fake_search_web
    )
    resp = client.post("/api/chat", json={"message": "search for q", "search": SEARCH})
    assert resp.status_code == 200
    sid = str(resp.json()["session_id"])
    hist = client.get("/api/history", params={"session_id": sid}).json()
    assistant = [m for m in hist["messages"] if m["role"] == "assistant"]
    (runs,) = assistant[0]["metadata"]["tool_runs"]
    assert runs["name"] == "web_search" and runs["input"] == {"query": "q"}
    assert "Untrusted content from" in str(runs["result"])
    assert "secret-key" not in json.dumps(hist)
    assert get_store() is not None
