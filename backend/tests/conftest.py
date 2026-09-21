"""Never load real VLM weights in tests — lifespan warmup is a no-op here.

Never hit the network from route tests either: the companion agent is
injected with a test-local echo provider. Production has no fake —
this seam lives in tests only.
"""

from collections.abc import Callable

import pytest
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

import app.main as main_module
import app.agents as agents_module
import app.realtime.qa as qa_module
import app.realtime.vlm as vlm
from app.agents.companion import get_companion_agent as build_agent, latest_user_text
from app.providers.base import ChatProvider


class EchoProvider(ChatProvider):
    """Test-local stand-in: deterministic reply, no native tool model."""

    async def reply(self, message: str) -> str:
        return f"Echo: {message}"


def _route_all(monkeypatch: pytest.MonkeyPatch, factory: Callable[..., object]) -> None:
    """Patch every get_companion_agent import site to the same factory."""
    monkeypatch.setattr(main_module, "get_companion_agent", factory)
    monkeypatch.setattr(agents_module, "get_companion_agent", factory)
    monkeypatch.setattr(qa_module, "get_companion_agent", factory)
    monkeypatch.setattr("app.agents.companion.get_companion_agent", factory)


@pytest.fixture(autouse=True)
def _no_vlm_warmup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vlm, "warmup", lambda: None)


@pytest.fixture(autouse=True)
def _echo_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Route /api/chat + frame Q&A through the real factory, echo in."""

    def echo_agent(
        provider: ChatProvider | None = None,
        *,
        clock: Callable[[], str] | None = None,
    ):
        return build_agent(EchoProvider(), clock=clock)

    _route_all(monkeypatch, echo_agent)


@pytest.fixture
def broken_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fixture to inject a broken agent for error testing."""
    class BrokenAgent:
        async def run(self, *args: object, **kwargs: object) -> object:
            raise RuntimeError("provider down")

    def broken_agent_factory(
        provider: ChatProvider | None = None,
        *,
        clock: Callable[[], str] | None = None,
    ):
        return build_agent(BrokenAgent(), clock=clock)

    _route_all(monkeypatch, broken_agent_factory)


@pytest.fixture
def tool_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fixture to inject a tool-capable agent for tool testing."""

    async def tool_calling_model(
        messages: list[ModelMessage], _info: AgentInfo
    ) -> ModelResponse:
        """Test-local fake model: calls the tool on time questions, speaks its return."""
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

    provider = EchoProvider()
    monkeypatch.setattr(
        provider, "create_tool_model", lambda: FunctionModel(tool_calling_model)
    )

    def tool_factory(_provider: ChatProvider | None = None, **kwargs: object) -> object:
        return build_agent(provider, **kwargs)

    _route_all(monkeypatch, tool_factory)
