"""Companion-owned conversation persistence (ADR-0002 data ownership).

The store *implementations* live here; the contracts (Turn,
ConversationStore) live in shared/ports.py. No other module touches these
tables directly — chat/vision persist via service.run_turn / append_assistant_text.
"""

import os
from uuid import uuid4

from ...shared.ports import MAX_STORED_MESSAGES, ConversationStore, Turn
from .supabase_store import (
    SupabaseConversationStore,
)

__all__ = ["InMemoryConversationStore", "get_store"]


class InMemoryConversationStore:
    """Ephemeral backend. Restart wipes all sessions by design."""

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
        global _supabase_store
        if _supabase_store is None:
            _supabase_store = SupabaseConversationStore()
        return _supabase_store
    return _memory_store
