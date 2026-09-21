"""Backward-compat shim. Supabase lives in app.db now; import from there."""

from ..db.repositories.conversations import SupabaseConversationStore

__all__ = ["SupabaseConversationStore"]
