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


class ConversationStore(Protocol):
    def create(self) -> str: ...
    def get(self, session_id: str) -> list[Turn] | None: ...
    def append(self, session_id: str, turn: Turn) -> None: ...


__all__ = [
    "ChatProvider",
    "ConversationStore",
    "MAX_STORED_MESSAGES",
    "Role",
    "Turn",
]
