"""Slice Q1-D: first local tool (get_current_time) behind the agent seam.

Contract frozen: tool runs inside the agent turn, mobile sees only text.
The tool-calling model is faked test-locally (a FunctionModel stand-in
in the native tool-model slot); production provider_function stays a
pure ChatProvider-to-text adapter so real-model traffic never hits a
substring trigger. Route tests inject the test-local echo provider
(conftest); production has no fake.
"""

from collections.abc import Awaitable, Callable

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo

from app.main import app
from app.modules.companion import assistant_text, get_store, latest_user_text

client = TestClient(app)

FIXED_TIME = "2026-01-01T00:00:00+00:00"
TIME_QUESTION = "what time is it?"


def tool_calling_model(
    messages: list[ModelMessage], _info: AgentInfo
) -> Awaitable[ModelResponse]:
    """Test-local fake model: calls the tool on time questions, speaks its return."""

    async def run() -> ModelResponse:
        for message in reversed(messages):
            for part in message.parts:
                if isinstance(part, ToolReturnPart):
                    return ModelResponse(
                        parts=[TextPart(f"The time is {part.content}")]
                    )
        if "time" in latest_user_text(messages).lower():
            return ModelResponse(
                parts=[ToolCallPart(tool_name="get_current_time", args={})]
            )
        raise AssertionError("fake model only handles time questions")

    return run()


def route_agent(monkeypatch: pytest.MonkeyPatch, clock: Callable[[], str]) -> None:
    """Route /api/chat through the real agent factory with injected clock + tool fake.

    The fake steers the native tool-model slot, so the agent loop runs
    its real tool machinery keyless (provider_function only serves
    providers without a native model).
    """
    from conftest import EchoProvider
    from pydantic_ai.models.function import FunctionModel

    from app.main import app as fastapi_app
    from app.modules.companion import agent_dependency
    from app.modules.companion import get_companion_agent as build_agent

    provider = EchoProvider()
    provider.create_tool_model = lambda: FunctionModel(tool_calling_model)  # type: ignore[method-assign]

    def _tool_override() -> object:
        return build_agent(provider, clock=clock)

    monkeypatch.setitem(fastapi_app.dependency_overrides, agent_dependency, _tool_override)


def post_time_question(clock: Callable[[], str]) -> dict:
    resp = client.post("/api/chat", json={"message": TIME_QUESTION})
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, dict)
    return body


def test_time_question_returns_tool_result(monkeypatch: pytest.MonkeyPatch) -> None:
    route_agent(monkeypatch, lambda: FIXED_TIME)
    body = post_time_question(lambda: FIXED_TIME)
    assert FIXED_TIME in str(body["reply"])


def test_tool_failure_is_llm_error_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken_clock() -> str:
        raise RuntimeError("clock down")

    route_agent(monkeypatch, broken_clock)
    resp = client.post("/api/chat", json={"message": TIME_QUESTION})
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "llm_error"


def test_tool_turn_stores_only_final_text(tool_agent) -> None:
    body = post_time_question(lambda: FIXED_TIME)
    turns = get_store().get(str(body["session_id"]))
    assert turns is not None and len(turns) == 2
    assert turns[0].role == "user" and turns[0].content == TIME_QUESTION
    assert turns[1].role == "assistant" and turns[1].content == body["reply"]
    assert all("get_current_time" not in t.content for t in turns)


def test_non_time_message_never_calls_tool() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"


def test_assistant_text_passes_plain_str() -> None:
    assert assistant_text("hi") == "hi"


def test_assistant_text_drops_tool_parts() -> None:
    """A turn ending on tool machinery must still bubble only text."""
    parts = [
        ToolCallPart(tool_name="get_current_time", args={}),
        TextPart("The time is 2026-01-01T00:00:00+00:00"),
    ]
    assert assistant_text(parts) == "The time is 2026-01-01T00:00:00+00:00"
