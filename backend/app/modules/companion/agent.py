"""Companion agent: portable turns at the boundary, framework messages inside.

The single factory seam every caller resolves through (tests override the
model via pydantic-ai's Agent.override, not by patching this factory).
"""

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from ...config.personality import COMPANION_SYSTEM_PROMPT
from ...providers import ChatProvider, get_provider
from ...shared.ports import ConversationStore, Turn
from .internal.tools.calculate import calculate as _calculate
from .internal.tools.datetime import local_time as _local_time
from .internal.tools.read_url import read_url as _read_url
from .internal.tools.web_search import SearchContext
from .internal.tools.web_search import run_web_search as _run_web_search


def assistant_text(output: object) -> str:
    """Reply text for the mobile bubble: tool calls never render.

    The agent loop resolves tool calls internally, but a turn ending
    on bare tool machinery (or a future non-text output) must not
    leak it into chat — extract text parts only.
    """
    if isinstance(output, str):
        return output
    if isinstance(output, list):
        return "".join(part.content for part in output if isinstance(part, TextPart))
    return str(output)


SESSION_TITLE_LEN = 48
"""First user message becomes the session title, truncated here."""


def assistant_metadata(
    tool_names: list[str] | None = None,
    usage: dict[str, int] | None = None,
    tool_runs: list[dict[str, object]] | None = None,
) -> dict[str, object] | None:
    """Assistant-turn metadata: names, token usage, and closed tool runs.

    Wave 1 persisted names only; ADR-007 adds run provenance (input plus
    truncated result per call) so the chat re-renders steps after reload.
    Inputs/results are user-visible turn data, never credentials — keys
    travel beside the turn, never inside it (ADR-004).
    """
    metadata: dict[str, object] | None = None
    if tool_names:
        metadata = {"tool_calls": tool_names}
    if tool_runs:
        metadata = {**(metadata or {}), "tool_runs": tool_runs}
    if usage is not None:
        metadata = {**(metadata or {}), "usage": usage}
    return metadata


def persist_turn(
    store: ConversationStore,
    session_id: str | None,
    user_text: str,
    reply: str,
    tool_names: list[str] | None = None,
    usage: dict[str, int] | None = None,
    tool_runs: list[dict[str, object]] | None = None,
) -> str:
    """One stored turn: mint the session when needed, then user + final text.

    The single place both chat routes persist, so tool internals can
    never land in history content — only the text the mobile bubble rendered.
    Structural tool *names* may ride in assistant metadata (never args or
    results); readers that replay history ignore metadata entirely.
    The first user message also titles untitled sessions (presentation
    policy — the store only offers set_title_if_empty).
    """
    session_id = session_id or store.create()
    store.set_title_if_empty(session_id, user_text[:SESSION_TITLE_LEN])
    store.append(session_id, Turn(role="user", content=user_text))
    store.append(
        session_id,
        Turn(
            role="assistant",
            content=reply,
            metadata=assistant_metadata(tool_names, usage, tool_runs),
        ),
    )
    return session_id


@dataclass(frozen=True)
class ToolRun:
    """One talent invocation as the client sees it: running, then done.

    id is the wire identity (framework tool_call_id): the client upserts
    running→done by id, so parallel same-name calls keep their results.
    """

    id: str
    name: str
    status: Literal["running", "done"]
    input: dict[str, Any]
    result: str | None


def _call_args(args: object) -> dict[str, Any]:
    """Tool-call arguments as a dict (pure).

    Non-streamed turns carry parsed dicts; streamed turns carry the raw
    JSON string (framework variance) — parsed here so steps render whole.
    Anything else reads as empty, never a raise.
    """
    if isinstance(args, dict):
        return dict(args)
    if isinstance(args, str):
        try:
            parsed = json.loads(args)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def tool_events(messages: list[ModelMessage]) -> list[ToolRun]:
    """Pair tool calls with their returns, in order (pure).

    Every call yields a running run plus a closing done run (result None
    when no return was captured), so render state is always closed pairs.
    Unmatched returns are ignored — they carry no invocation to display.
    """
    runs: list[ToolRun] = []
    pending: list[tuple[str, str, dict[str, Any]]] = []
    seq = 0
    for message in messages:
        for part in message.parts:
            if isinstance(part, ToolCallPart):
                call_id = (
                    part.tool_call_id
                    if isinstance(part.tool_call_id, str)
                    else f"{part.tool_name}-{seq}"
                )
                seq += 1
                args = _call_args(part.args)
                pending.append((call_id, part.tool_name, args))
                runs.append(
                    ToolRun(
                        id=call_id,
                        name=part.tool_name,
                        status="running",
                        input=args,
                        result=None,
                    )
                )
            elif isinstance(part, ToolReturnPart):
                for i, (call_id, name, args) in enumerate(pending):
                    if call_id == part.tool_call_id:
                        del pending[i]
                        runs.append(
                            ToolRun(
                                id=call_id,
                                name=name,
                                status="done",
                                input=args,
                                result=str(part.content),
                            )
                        )
                        break
    for call_id, name, args in pending:
        runs.append(
            ToolRun(id=call_id, name=name, status="done", input=args, result=None)
        )
    return runs


def tool_names(messages: list[ModelMessage]) -> list[str]:
    """Tool names invoked across agent messages, in order, deduplicated."""
    names: list[str] = []
    for message in messages:
        for part in message.parts:
            if isinstance(part, ToolCallPart) and part.tool_name not in names:
                names.append(part.tool_name)
    return names


def latest_user_text(messages: list[ModelMessage]) -> str:
    text = ""
    for message in messages:
        for part in message.parts:
            if isinstance(part, UserPromptPart) and isinstance(part.content, str):
                text = part.content
    return text


def provider_function(
    provider: ChatProvider,
) -> Callable[[list[ModelMessage], AgentInfo], Awaitable[ModelResponse]]:
    async def run(messages: list[ModelMessage], _info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart(await provider.reply(latest_user_text(messages)))])  # fmt: skip

    return run


def to_message_history(turns: list[Turn]) -> list[ModelMessage]:
    """Agent-boundary adapter: portable turns in, framework messages out."""
    history: list[ModelMessage] = []
    for turn in turns:
        if turn.role == "assistant":
            history.append(ModelResponse(parts=[TextPart(turn.content)]))
        else:
            history.append(ModelRequest(parts=[UserPromptPart(turn.content)]))
    return history


def get_companion_agent(
    provider: ChatProvider | None = None,
    *,
    clock: Callable[[], str] | None = None,
) -> Agent[None, str]:
    provider = provider if provider is not None else get_provider()
    # ponytail: injectable clock so tool tests never touch the wall clock
    current_time = clock if clock is not None else _local_time
    # ponytail: native model drives the tool loop for providers that
    # offer one; others keep the deterministic FunctionModel echo.
    # tool_timeout bounds each talent execution (talents carry their own
    # tighter timeouts; this is the seatbelt). No max-turn knob exists in
    # this framework version — the loop ends when the model answers, so a
    # pathologically stubborn model would stream until the client goes away.
    agent: Agent[None, str] = Agent(
        provider.create_tool_model()
        or FunctionModel(provider_function(provider), model_name="liai-provider"),
        system_prompt=COMPANION_SYSTEM_PROMPT,
        tool_timeout=60.0,
    )

    @agent.tool  # type: ignore[arg-type]
    def get_current_time(_ctx: RunContext[None]) -> str:
        """Return the current local time as an ISO-8601 string."""
        return current_time()

    @agent.tool_plain
    def calculate(expression: str) -> str:
        """Evaluate an arithmetic expression (numbers, +-*/%**, sqrt/abs/round/min/max, pi/e)."""
        return _calculate(expression)

    @agent.tool_plain
    def read_url(url: str) -> str:
        """Fetch a public web page and return its main text for reading."""
        return _read_url(url)

    @agent.tool  # type: ignore[arg-type]
    def web_search(ctx: RunContext[SearchContext | None], query: str) -> str:
        """Search the web for current events or facts beyond training data."""
        return _run_web_search(query, ctx.deps)

    return agent


def agent_dependency() -> Agent[None, str]:
    """Zero-arg Depends target (factory params are not request params)."""
    return get_companion_agent()
