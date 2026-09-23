"""Never load real VLM weights in tests — lifespan warmup is a no-op here.

Never hit the network from route tests either: the companion agent is
injected via FastAPI dependency_overrides (no monkeypatching of the
factory — the single seam is app.modules.companion.get_companion_agent
as a Depends target). Production has no fake — this seam lives in tests only.
"""

from collections.abc import Callable, Iterator

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

import app.shared.vlm as vlm
from app.main import app
from app.modules.companion import agent_dependency
from app.modules.companion import get_companion_agent as build_agent
from app.providers.base import ChatProvider


def assert_envelope(resp_json: object, code: str) -> None:
    """Shared contract assertion: every backend error uses the envelope."""
    assert isinstance(resp_json, dict)
    err = resp_json["error"]
    assert err["code"] == code
    assert isinstance(err["message"], str) and err["message"]


class EchoProvider(ChatProvider):
    """Test-local stand-in: deterministic reply, no native tool model."""

    model_name = "echo"

    async def reply(self, message: str) -> str:
        return f"Echo: {message}"


@pytest.fixture(autouse=True)
def _no_vlm_warmup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vlm, "warmup", lambda: None)


def _override_agent(factory: Callable[..., object]) -> Iterator[None]:
    app.dependency_overrides[agent_dependency] = factory
    try:
        yield
    finally:
        app.dependency_overrides.pop(agent_dependency, None)


@pytest.fixture(autouse=True)
def _echo_agent() -> Iterator[None]:
    """Route /api/chat + frame Q&A through the real factory, echo in."""

    def echo_agent() -> object:
        return build_agent(EchoProvider())

    yield from _override_agent(echo_agent)


@pytest.fixture
def broken_agent() -> Iterator[None]:
    """Fixture to inject a broken agent for error testing."""
    class BrokenAgent:
        model_name = "broken"

        async def reply(self, message: str) -> str:
            raise RuntimeError("provider down")

        def create_tool_model(self) -> None:
            return None

    def broken_agent_factory() -> object:
        return build_agent(BrokenAgent())

    yield from _override_agent(broken_agent_factory)


@pytest.fixture
def tool_agent() -> Iterator[None]:
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
        from app.modules.companion import latest_user_text

        if "time" in latest_user_text(messages).lower():
            return ModelResponse(
                parts=[ToolCallPart(tool_name="get_current_time", args={})]
            )
        raise AssertionError("fake model only handles time questions")

    provider = EchoProvider()
    provider.create_tool_model = lambda: FunctionModel(tool_calling_model)  # type: ignore[method-assign]

    def tool_factory() -> object:
        return build_agent(provider)

    yield from _override_agent(tool_factory)


def make_echo_agent() -> Agent[None, str]:
    """Explicit echo agent for direct service calls (bypasses HTTP overrides)."""
    return build_agent(EchoProvider())


def make_broken_agent() -> Agent[None, str]:
    """Explicit broken agent for direct service calls."""

    class BrokenAgent:
        model_name = "broken"

        async def reply(self, message: str) -> str:
            raise RuntimeError("provider down")

        def create_tool_model(self) -> None:
            return None

    return build_agent(BrokenAgent())
