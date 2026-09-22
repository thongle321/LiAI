"""Durable ConversationStore on Supabase sessions/messages tables.

Row mappers are pure (tested); only execute() touches the network.
"""

import json
from typing import Any  # reason: supabase rows and json.loads are dynamic by nature
from uuid import uuid4

from ...memory.store import MAX_STORED_MESSAGES, Turn
from ..client import get_client


def turn_to_row(session_id: str, turn: Turn) -> dict[str, Any]:
    """Turn -> messages insert payload. Metadata serializes to JSON."""
    return {
        "session_id": session_id,
        "role": turn.role,
        "content": turn.content,
        "type": turn.type,
        "metadata": json.dumps(turn.metadata) if turn.metadata is not None else None,
    }


def row_to_turn(row: dict[str, Any]) -> Turn:
    """messages row -> Turn. Corrupt metadata degrades to None, never raises."""
    metadata = row.get("metadata")
    parsed: dict[str, object] | None = None
    if isinstance(metadata, dict):
        parsed = metadata
    elif isinstance(metadata, str):
        try:
            loaded: Any = json.loads(metadata)  # reason: json.loads is dynamic by nature
            parsed = loaded if isinstance(loaded, dict) else None
        except (ValueError, TypeError):
            parsed = None
    return Turn(
        role=row["role"],
        content=row["content"],
        type=row["type"] if isinstance(row.get("type"), str) else "text",
        metadata=parsed,
    )


class SupabaseConversationStore:
    def __init__(self, client: Any | None = None) -> None:
        # reason: SDK client (or test fake) is a dynamic PostgREST chain,
        # same nature as the row dicts below
        # Eager credential check preserves the old fail-fast behavior;
        # tests inject a fake client adapter and skip get_client entirely.
        self._client = client if client is not None else get_client()

    def create(self) -> str:
        session_id = uuid4().hex
        self._client.from_("sessions").insert({"id": session_id}).execute()
        return session_id

    def get(self, session_id: str) -> list[Turn] | None:
        session = (
            self._client.from_("sessions")
            .select("id")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        if not session.data:
            return None
        rows = (
            self._client.from_("messages")
            .select("role,content,type,metadata")
            .eq("session_id", session_id)
            .order("created_at", desc=True)
            .order("id", desc=True)
            .limit(MAX_STORED_MESSAGES)
            .execute()
        )
        return [row_to_turn(r) for r in reversed(rows.data)]

    def append(self, session_id: str, turn: Turn) -> None:
        self._client.from_("sessions").upsert({"id": session_id}).execute()
        self._client.from_("messages").insert(turn_to_row(session_id, turn)).execute()
