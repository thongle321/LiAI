"""Chat module: HTTP chat + history. Public surface (re-export only)."""

from .router import router
from .schemas import (
    ByokAuth,
    ChatRequest,
    ChatResponse,
    HistoryMessage,
    HistoryResponse,
    SearchAuth,
    SessionInfoResponse,
    SessionListResponse,
    SessionUpdateRequest,
)

__all__ = [
    "ByokAuth",
    "ChatRequest",
    "ChatResponse",
    "HistoryMessage",
    "HistoryResponse",
    "SearchAuth",
    "SessionInfoResponse",
    "SessionListResponse",
    "SessionUpdateRequest",
    "router",
]
