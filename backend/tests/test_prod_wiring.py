"""Production wiring: OpenRouter provider drives a native tool-capable model.

Fake path untouched (FunctionModel echo + test-local tool fake).
Keyless construction (no network in CI); invocation proven live (Q6).
"""

import pytest
from conftest import EchoProvider
from pydantic_ai.exceptions import UserError
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.openrouter import OpenRouterModel

from app.agents.companion import get_companion_agent
from app.providers.openrouter import OpenRouterChatProvider


def test_openrouter_provider_builds_native_model() -> None:
    agent = get_companion_agent(
        provider=OpenRouterChatProvider(api_key="test-key"), clock=lambda: "t"
    )
    assert isinstance(agent.model, OpenRouterModel)


def test_tool_registered_on_native_model() -> None:
    agent = get_companion_agent(
        provider=OpenRouterChatProvider(api_key="test-key"), clock=lambda: "t"
    )
    assert len(agent.toolsets) == 1


def test_missing_key_fails_fast_at_build(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    try:
        get_companion_agent(provider=OpenRouterChatProvider(api_key=""))
    except UserError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)
    else:
        raise AssertionError("expected UserError")


def test_default_agent_build_without_key_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Clear the provider cache to ensure fresh provider creation
    from app.providers.factory import clear_provider_cache

    clear_provider_cache()
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    try:
        get_companion_agent()
    except UserError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)
    else:
        raise AssertionError("expected UserError")


def test_explicit_echo_provider_uses_function_model() -> None:
    agent = get_companion_agent(provider=EchoProvider(), clock=lambda: "t")
    assert isinstance(agent.model, FunctionModel)
