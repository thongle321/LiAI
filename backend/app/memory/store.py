"""Server-owned conversation history.

Framework-agnostic portable turns. This module never imports Pydantic AI:
the agent-side adapter converts turns at the boundary.
"""

import os
from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import uuid4

Role = Literal["user", "assistant"]

# 50 exchanges = at most 100 stored messages. Personality prompt is
# agent-level and never counted here.
MAX_STORED_MESSAGES = 100


@dataclass(frozen=True)
class Turn:
    role: Role
    content: str


class ConversationStore(Protocol):
    def create(self) -> str: ...
    def get(self, session_id: str) -> list[Turn] | None: ...
    def append(self, session_id: str, turn: Turn) -> None: ...


class InMemoryConversationStore:
    """Ephemeral slice-3 backend. Restart wipes all sessions by design."""

    def __init__(self) -> None:
        self._sessions: dict[str, list[Turn]] = {}

    def create(self) -> str:
        session_id = uuid4().hex
        self._sessions[session_id] = []
        return session_id

    def get(self, session_id: str) -> list[Turn] | None:
        turns = self._sessions.get(session_id)
        return list(turns) if turns is not None else None

    def append(self, session_id: str, turn: Turn) -> None:
        turns = self._sessions.setdefault(session_id, [])
        turns.append(turn)
        del turns[:-MAX_STORED_MESSAGES]


_memory_store = InMemoryConversationStore()
_supabase_store: ConversationStore | None = None


def get_store() -> ConversationStore:
    """Explicit backend selection. Default memory keeps dev/tests key-free."""
    if os.getenv("CONVERSATION_STORE", "memory").strip().lower() == "supabase":
        from .supabase_store import SupabaseConversationStore

        global _supabase_store
        if _supabase_store is None:
            _supabase_store = SupabaseConversationStore()
        return _supabase_store
    return _memory_store
