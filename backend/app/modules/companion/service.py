"""One turn: load/mint session → produce reply → persist.

The single place both chat routes compose a turn, so the
persist/no-history asymmetry is one visible argument (use_history)
instead of an invisible difference between call sites. Published contract
for the downstream conformists (chat, vision): they import run_turn /
append_assistant_text from the companion surface, never the store directly.
"""

from dataclasses import dataclass

from pydantic_ai import Agent

from ...realtime import vlm
from ...shared.ports import ConversationStore, Turn
from . import agent as agent_module
from .agent import (
    assistant_text,
    persist_turn,
    to_message_history,
    tool_names,
)
from .store import get_store


class StoreError(Exception):
    """Persistence failed at the turn seam; routes map it to 503."""


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
    if image is not None:
        reply = await vlm.describe_frame(image, message)
    else:
        agent = agent or agent_module.get_companion_agent()
        result = await agent.run(
            prompt or message,
            message_history=to_message_history(history),
        )
        reply = assistant_text(result.output)
        names = tool_names(result.all_messages())

    try:
        session_id = persist_turn(store, session_id, message, reply, names)
    except Exception as exc:
        raise StoreError(str(exc)) from exc
    return TurnOutcome(reply=reply, session_id=session_id)


def append_assistant_text(
    caption: str,
    session_id: str | None = None,
    *,
    store: ConversationStore | None = None,
) -> str:
    """Persist a caption as an assistant-only Turn; returns the session.

    The ownership fix: vision narration stores through this companion API,
    never store.append / SQL directly.
    """
    store = store or get_store()
    session_id = session_id or store.create()
    store.append(session_id, Turn(role="assistant", content=caption))
    return session_id
