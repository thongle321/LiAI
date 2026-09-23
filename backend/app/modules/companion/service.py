"""One turn: load/mint session → produce reply → persist.

The single place both chat routes compose a turn, so the
persist/no-history asymmetry is one visible argument (use_history)
instead of an invisible difference between call sites. Published contract
for the downstream conformists (chat, vision): they import run_turn /
append_assistant_text from the companion surface, never the store directly.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from pydantic_ai import Agent

from ...shared import vlm
from ...shared.ports import ConversationStore, Turn
from . import agent as agent_module
from .agent import (
    SESSION_TITLE_LEN,
    SearchContext,
    ToolRun,
    assistant_metadata,
    assistant_text,
    persist_turn,
    to_message_history,
    tool_events,
    tool_names,
)
from .store import get_store


class StoreError(Exception):
    """Persistence failed at the turn seam; routes map it to 503."""


class NothingToRegenerate(Exception):
    """Retry asked for an answer with no stored question; routes map it to 400."""


@dataclass(frozen=True)
class StreamStart:
    session_id: str


@dataclass(frozen=True)
class StreamToken:
    text: str


@dataclass(frozen=True)
class StreamToolCall:
    name: str
    status: str
    input: dict[str, object] | None
    result: str | None
    id: str


@dataclass(frozen=True)
class StreamUsage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass(frozen=True)
class StreamDone:
    """End marker; carries the session id so a client that missed `start`
    still learns which conversation completed."""

    session_id: str


StreamEvent = StreamStart | StreamToken | StreamToolCall | StreamUsage | StreamDone
"""Events the chat stream may yield, in order: start, tokens, tools, usage, done."""


RESULT_MAX_CHARS = 2000
"""Tool-result cap on the wire and in stored provenance: the answer carries
what matters; steps keep enough to re-render, never whole pages."""


def _done_dicts(runs: list[ToolRun]) -> list[dict[str, object]]:
    """Closed runs as storable provenance (inputs + truncated results)."""
    return [
        {"name": run.name, "input": run.input, "result": _truncate(run.result)}
        for run in runs
        if run.status == "done"
    ]


def _truncate(result: str | None) -> str | None:
    if result is None or len(result) <= RESULT_MAX_CHARS:
        return result
    return result[:RESULT_MAX_CHARS] + "\n…[truncated]"


@dataclass(frozen=True)
class TurnOutcome:
    reply: str
    session_id: str


async def run_turn(
    store: ConversationStore,
    session_id: str | None,
    message: str,
    *,
    image: bytes | None = None,
    prompt: str | None = None,
    use_history: bool = True,
    agent: Agent[None, str] | None = None,
    search: SearchContext | None = None,
) -> TurnOutcome:
    """Run one companion turn and store user + final text.

    use_history=True (HTTP chat): existing session's turns feed the
    agent; unknown/absent id mints a fresh session.
    use_history=False (frame Q&A): no store read, no agent history;
    a supplied session id is kept as-is (durable adapter upserts).
    image present: reply comes straight from the VLM (no agent, no tools).
    prompt: agent-bound text override — frame Q&A composes a vision
    prompt but persists the user's original message.
    agent: injectable for tests (DI override); default builds via factory.
    """
    history: list[Turn] = []
    try:
        if use_history:
            turns = store.get(session_id) if session_id is not None else None
            if turns is None:
                session_id = store.create()
            else:
                history = turns
        elif session_id is None:
            session_id = store.create()
    except Exception as exc:
        raise StoreError(str(exc)) from exc

    names: list[str] | None = None
    dones: list[dict[str, object]] | None = None
    if image is not None:
        reply = await vlm.describe_frame(image, message)
    else:
        agent = agent or agent_module.get_companion_agent()
        result = await agent.run(
            prompt or message,
            message_history=to_message_history(history),
            deps=search,  # type: ignore[arg-type]
        )
        reply = assistant_text(result.output)
        paired = tool_events(result.all_messages())
        names = tool_names(result.all_messages())
        dones = _done_dicts(paired) or None

    try:
        session_id = persist_turn(store, session_id, message, reply, names, None, dones)
    except Exception as exc:
        raise StoreError(str(exc)) from exc
    return TurnOutcome(reply=reply, session_id=session_id)


async def prepare_stream_turn(
    store: ConversationStore,
    session_id: str | None,
    message: str | None,
    *,
    retry: bool = False,
) -> tuple[str, str, list[Turn]]:
    """Resolve session + persist the user side before the first stream byte.

    Returns (session_id, text, history) where history excludes the turn being
    answered, so the agent never sees the question twice. Raises StoreError
    (route maps to 503) and NothingToRegenerate (route maps to 400).
    The route calls this eagerly so pre-stream failures keep JSON statuses;
    only token generation streams.
    """
    try:
        if retry:
            # Router guarantees message is None on retry: regenerate reuses
            # the stored question, never resends it (no duplicate bubbles).
            if session_id is None or store.get(session_id) is None:
                raise NothingToRegenerate("nothing to regenerate")
            store.pop_last_assistant(session_id)
            turns = store.get(session_id) or []
            users = [t.content for t in turns if t.role == "user"]
            if not users:
                raise NothingToRegenerate("nothing to regenerate")
            return session_id, users[-1], turns[:-1]
        if message is None or not message.strip():
            raise NothingToRegenerate("message is required")
        turns = store.get(session_id) if session_id is not None else None
        resolved = session_id
        if turns is None or resolved is None:
            resolved = store.create()
            turns = []
        store.set_title_if_empty(resolved, message[:SESSION_TITLE_LEN])
        store.append(resolved, Turn(role="user", content=message))
        return resolved, message, turns
    except NothingToRegenerate:
        raise
    except Exception as exc:
        raise StoreError(str(exc)) from exc


def _count(value: object) -> int:
    """Token counter: ints pass through, missing/odd values read as zero."""
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def _usage_of(
    result: Any,
) -> StreamUsage:  # reason: StreamedRunResult shape varies by model backend
    maybe_usage = result.usage
    resolved = maybe_usage() if callable(maybe_usage) else maybe_usage
    return StreamUsage(
        prompt_tokens=_count(getattr(resolved, "request_tokens", 0)),
        completion_tokens=_count(getattr(resolved, "response_tokens", 0)),
        total_tokens=_count(getattr(resolved, "total_tokens", 0)),
    )


def _usage_dict(usage: StreamUsage) -> dict[str, int]:
    return {
        "prompt_tokens": usage.prompt_tokens,
        "completion_tokens": usage.completion_tokens,
        "total_tokens": usage.total_tokens,
    }


async def stream_turn_events(
    store: ConversationStore,
    session_id: str,
    text: str,
    history: list[Turn],
    *,
    image: bytes | None = None,
    agent: Agent[None, str] | None = None,
    search: SearchContext | None = None,
) -> AsyncIterator[StreamEvent]:
    """Yield the reply as stream events, then persist the assistant turn.

    The user turn is already stored by prepare_stream_turn, so a killed
    stream leaves the question (regenerable) instead of a silent gap.
    Raises on failure; the route converts it to an `error` SSE event
    because the status line is already sent.
    """
    if image is not None:
        reply = await vlm.describe_frame(image, text)
        yield StreamToken(reply)
        usage = StreamUsage(0, 0, 0)
        names: list[str] = []
        paired: list[ToolRun] = []
        dones: list[dict[str, object]] = []
    else:
        agent = agent or agent_module.get_companion_agent()
        parts: list[str] = []
        async with agent.run_stream(
            text,
            message_history=to_message_history(history),
            deps=search,  # type: ignore[arg-type]
        ) as result:
            async for chunk in result.stream_text(delta=True):
                parts.append(chunk)
                yield StreamToken(chunk)
            paired = tool_events(result.all_messages())
            names = tool_names(result.all_messages())
            dones = _done_dicts(paired)
            usage = _usage_of(result)
        reply = "".join(parts)
    for run in paired:
        yield StreamToolCall(
            run.name, run.status, run.input, _truncate(run.result), run.id
        )
    yield usage
    append_assistant_text(
        reply,
        session_id,
        store=store,
        metadata=assistant_metadata(names or None, _usage_dict(usage), dones or None),
    )
    yield StreamDone(session_id)


def append_assistant_text(
    caption: str,
    session_id: str | None = None,
    *,
    store: ConversationStore | None = None,
    metadata: dict[str, object] | None = None,
) -> str:
    """Persist a caption as an assistant-only Turn; returns the session.

    The ownership fix: vision narration stores through this companion API,
    never store.append / SQL directly. The stream path reuses it for the
    assistant turn (with tool/usage metadata).
    """
    store = store or get_store()
    session_id = session_id or store.create()
    store.append(session_id, Turn(role="assistant", content=caption, metadata=metadata))
    return session_id
