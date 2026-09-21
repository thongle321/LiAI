"""Never load real VLM weights in tests — lifespan warmup is a no-op here.

Never hit the network from route tests either: the companion agent is
injected with a test-local echo provider. Production has no fake —
this seam lives in tests only.
"""

from collections.abc import Callable

import pytest

import app.main as main_module
import app.realtime.qa as qa_module
import app.realtime.vlm as vlm
from app.agents import get_companion_agent as build_agent
from app.providers.base import ChatProvider


class EchoProvider(ChatProvider):
    """Test-local stand-in: deterministic reply, no native tool model."""

    async def reply(self, message: str) -> str:
        return f"Echo: {message}"


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

    monkeypatch.setattr(main_module, "get_companion_agent", echo_agent)
    monkeypatch.setattr(qa_module, "get_companion_agent", echo_agent)
