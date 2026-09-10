"""Durable ConversationStore on Supabase. Only module that imports the SDK."""

import os
from uuid import uuid4

from supabase import Client, create_client

from .store import MAX_STORED_MESSAGES, Turn


class SupabaseConversationStore:
    def __init__(
        self,
        url: str | None = None,
        secret_key: str | None = None,
    ) -> None:
        url = url or os.getenv("SUPABASE_URL", "")
        key = secret_key or os.getenv("SUPABASE_SECRET_KEY", "")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY must be set"
            )
        self._client: Client = create_client(url, key)

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
            .select("role,content")
            .eq("session_id", session_id)
            .order("created_at", desc=True)
            .order("id", desc=True)
            .limit(MAX_STORED_MESSAGES)
            .execute()
        )
        return [Turn(role=r["role"], content=r["content"]) for r in reversed(rows.data)]

    def append(self, session_id: str, turn: Turn) -> None:
        self._client.from_("sessions").upsert({"id": session_id}).execute()
        self._client.from_("messages").insert(
            {"session_id": session_id, "role": turn.role, "content": turn.content}
        ).execute()
