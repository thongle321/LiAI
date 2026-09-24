"""Durable ConversationStore on Supabase sessions/messages tables.

Row mappers are pure (tested); only execute() touches the network.
Owned by companion (ADR-0002 data ownership); shared/db holds only the client.
"""

import json
from datetime import UTC, datetime
from typing import (
    Any,
    cast,
)

# reason: supabase rows and json.loads are dynamic by nature
from uuid import uuid4

from ...db.client import get_client
from ...shared.ports import MAX_STORED_MESSAGES, SessionInfo, Turn


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
            loaded: Any = json.loads(
                metadata
            )  # reason: json.loads is dynamic by nature
            parsed = loaded if isinstance(loaded, dict) else None
        except (ValueError, TypeError):
            parsed = None
    return Turn(
        role=row["role"],
        content=row["content"],
        type=row["type"] if isinstance(row.get("type"), str) else "text",
        metadata=parsed,
    )


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


def _row_to_session(row: dict[str, Any]) -> SessionInfo:
    """sessions row -> SessionInfo. Pre-migration rows degrade to defaults."""
    title = row.get("title")
    pinned = row.get("pinned")
    updated = row.get("updated_at")
    return SessionInfo(
        id=row["id"],
        title=title if isinstance(title, str) else "",
        pinned=isinstance(pinned, bool) and pinned,
        updated_at=updated if isinstance(updated, str) else "",
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
        # cast: PostgREST select rows are dicts; stubs type data as list[JSON]
        return [row_to_turn(cast(dict[str, Any], r)) for r in reversed(rows.data)]

    def append(self, session_id: str, turn: Turn) -> None:
        self._client.from_("sessions").upsert({"id": session_id}).execute()
        self._client.from_("messages").insert(turn_to_row(session_id, turn)).execute()

    def list_sessions(self) -> list[SessionInfo]:
        rows = (
            self._client.from_("sessions")
            .select("id,title,pinned,updated_at")
            .order("pinned", desc=True)
            .order("updated_at", desc=True)
            .execute()
        )
        return [_row_to_session(cast(dict[str, Any], r)) for r in rows.data]

    def rename_session(self, session_id: str, title: str) -> bool:
        res = (
            self._client.from_("sessions")
            .update({"title": title, "updated_at": _utcnow()})
            .eq("id", session_id)
            .execute()
        )
        return bool(res.data)

    def set_session_pinned(self, session_id: str, pinned: bool) -> bool:
        res = (
            self._client.from_("sessions")
            .update({"pinned": pinned, "updated_at": _utcnow()})
            .eq("id", session_id)
            .execute()
        )
        return bool(res.data)

    def delete_session(self, session_id: str) -> bool:
        self._client.from_("messages").delete().eq("session_id", session_id).execute()
        res = self._client.from_("sessions").delete().eq("id", session_id).execute()
        return bool(res.data)

    def set_title_if_empty(self, session_id: str, title: str) -> None:
        self._client.from_("sessions").update({"title": title}).eq("id", session_id).eq(
            "title", ""
        ).execute()

    def pop_last_assistant(self, session_id: str) -> bool:
        latest = (
            self._client.from_("messages")
            .select("id,role")
            .eq("session_id", session_id)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        if not latest.data:
            return False
        row = cast(dict[str, Any], latest.data[0])
        if row.get("role") != "assistant":
            return False
        self._client.from_("messages").delete().eq("id", row["id"]).execute()
        return True
