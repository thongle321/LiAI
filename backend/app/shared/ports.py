"""Port surface (ADR-0002): the contracts modules conform to, in one place.

Kernel-owned types (Turn, ConversationStore, MAX_STORED_MESSAGES) are defined
here — portable, framework-free. Implementations live with their owning module
(companion/store.py); ChatProvider is defined in providers/base.py and
re-exported for a single import surface. Types only — no implementations.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

from ..providers.base import ChatProvider

Role = Literal["user", "assistant"]

# 50 exchanges = at most 100 stored messages. Personality prompt is
# agent-level and never counted here.
MAX_STORED_MESSAGES = 100


@dataclass(frozen=True)
class Turn:
    role: Role
    content: str
    type: str = "text"
    metadata: dict[str, object] | None = None


@dataclass(frozen=True)
class SessionInfo:
    """Listed session metadata. Chronology is an ISO-8601 string so both
    stores (epoch floats would differ) serialize the same shape."""

    id: str
    title: str
    pinned: bool
    updated_at: str


class ConversationStore(Protocol):
    def create(self) -> str: ...
    def get(self, session_id: str) -> list[Turn] | None: ...
    def append(self, session_id: str, turn: Turn) -> None: ...
    def list_sessions(self) -> list[SessionInfo]: ...
    def rename_session(self, session_id: str, title: str) -> bool: ...
    def set_session_pinned(self, session_id: str, pinned: bool) -> bool: ...
    def delete_session(self, session_id: str) -> bool: ...
    def set_title_if_empty(self, session_id: str, title: str) -> None: ...
    def pop_last_assistant(self, session_id: str) -> bool: ...


__all__ = [
    "MAX_STORED_MESSAGES",
    "ChatProvider",
    "ConversationStore",
    "Role",
    "Turn",
]
