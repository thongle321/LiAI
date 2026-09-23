"""Companion module: agent reasoning, tools, turn seam, persistence. Public surface."""

from ...shared.ports import MAX_STORED_MESSAGES, ConversationStore, Turn
from .agent import (
    agent_dependency,
    assistant_text,
    get_companion_agent,
    latest_user_text,
    persist_turn,
    provider_function,
    to_message_history,
    tool_names,
)
from .service import StoreError, TurnOutcome, append_assistant_text, run_turn
from .store import InMemoryConversationStore, get_store
from .supabase_store import SupabaseConversationStore, row_to_turn, turn_to_row

__all__ = [
    "MAX_STORED_MESSAGES",
    "ConversationStore",
    "InMemoryConversationStore",
    "StoreError",
    "SupabaseConversationStore",
    "Turn",
    "TurnOutcome",
    "agent_dependency",
    "append_assistant_text",
    "assistant_text",
    "get_companion_agent",
    "get_store",
    "latest_user_text",
    "persist_turn",
    "provider_function",
    "row_to_turn",
    "run_turn",
    "to_message_history",
    "tool_names",
    "turn_to_row",
]
