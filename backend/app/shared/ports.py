"""Port surface (ADR-0002): the contracts modules conform to, in one place.

The dataclass/Protocol definitions live with their home modules; this module
re-exports them so conformists (chat, vision → companion) import the contract
from exactly one surface. Types only — no implementations here.
"""

from ..memory.store import ConversationStore, Turn
from ..providers.base import ChatProvider

__all__ = ["ChatProvider", "ConversationStore", "Turn"]
