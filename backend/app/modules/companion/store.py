"""Companion-owned conversation persistence (ADR-0002 data ownership).

The store *implementations* live here; the contracts (Turn,
ConversationStore) live in shared/ports.py. No other module touches these
tables directly — chat/vision persist via service.run_turn / append_assistant_text.
"""

import os
from datetime import UTC, datetime
from uuid import uuid4

from ...shared.ports import (
    MAX_STORED_MESSAGES,
    ConversationStore,
    SessionInfo,
    Turn,
)
from .supabase_store import (
    SupabaseConversationStore,
)

__all__ = ["InMemoryConversationStore", "get_store"]


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


class InMemoryConversationStore:
    """Ephemeral backend. Restart wipes all sessions by design."""

    def __init__(self) -> None:
        self._sessions: dict[str, list[Turn]] = {}
        self._meta: dict[str, dict[str, object]] = {}

    def create(self) -> str:
        session_id = uuid4().hex
        self._sessions[session_id] = []
        self._meta[session_id] = {
            "title": "",
            "pinned": False,
            "updated_at": _utcnow(),
        }
        return session_id

    def get(self, session_id: str) -> list[Turn] | None:
        turns = self._sessions.get(session_id)
        if turns is None:
            return None
        return list(turns)

    def append(self, session_id: str, turn: Turn) -> None:
        turns = self._sessions.setdefault(session_id, [])
        turns.append(turn)
        del turns[:-MAX_STORED_MESSAGES]
        meta = self._meta.setdefault(
            session_id, {"title": "", "pinned": False, "updated_at": _utcnow()}
        )
        meta["updated_at"] = _utcnow()

    def list_sessions(self) -> list[SessionInfo]:
        infos = [
            SessionInfo(
                id=sid,
                title=str(meta.get("title", "")),
                pinned=bool(meta.get("pinned", False)),
                updated_at=str(meta.get("updated_at", "")),
            )
            for sid, meta in self._meta.items()
            if sid in self._sessions
        ]
        infos.sort(key=lambda i: (i.pinned, i.updated_at), reverse=True)
        return infos

    def rename_session(self, session_id: str, title: str) -> bool:
        meta = self._meta.get(session_id)
        if meta is None or session_id not in self._sessions:
            return False
        meta["title"] = title
        meta["updated_at"] = _utcnow()
        return True

    def set_session_pinned(self, session_id: str, pinned: bool) -> bool:
        meta = self._meta.get(session_id)
        if meta is None or session_id not in self._sessions:
            return False
        meta["pinned"] = pinned
        meta["updated_at"] = _utcnow()
        return True

    def delete_session(self, session_id: str) -> bool:
        if session_id not in self._sessions:
            return False
        del self._sessions[session_id]
        self._meta.pop(session_id, None)
        return True

    def set_title_if_empty(self, session_id: str, title: str) -> None:
        meta = self._meta.get(session_id)
        if meta is not None and not meta.get("title"):
            meta["title"] = title

    def pop_last_assistant(self, session_id: str) -> bool:
        turns = self._sessions.get(session_id)
        if not turns or turns[-1].role != "assistant":
            return False
        turns.pop()
        return True


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
