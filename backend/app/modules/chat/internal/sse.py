"""SSE wire format + StreamEvent mapping (pure, tested).

One event per block: `event: <name>` then a single-line JSON `data:` line.
Payloads serialize compactly so route tests can pin exact bytes.
"""

import json
from typing import Any

from ...companion import (
    StreamDone,
    StreamEvent,
    StreamStart,
    StreamToken,
    StreamToolCall,
    StreamUsage,
)


def format_event(name: str, payload: dict[str, Any]) -> str:
    """Render one SSE block."""
    return f"event: {name}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


__all__ = ["event_to_sse", "format_event"]


def event_to_sse(event: StreamEvent) -> str:
    """Companion stream event -> wire block (total: one branch per event)."""
    if isinstance(event, StreamStart):
        return format_event("start", {"session_id": event.session_id})
    if isinstance(event, StreamToken):
        return format_event("token", {"text": event.text})
    if isinstance(event, StreamToolCall):
        return format_event("tool", {"name": event.name})
    if isinstance(event, StreamUsage):
        return format_event(
            "usage",
            {
                "prompt_tokens": event.prompt_tokens,
                "completion_tokens": event.completion_tokens,
                "total_tokens": event.total_tokens,
            },
        )
    if isinstance(event, StreamDone):
        return format_event("done", {"session_id": event.session_id})
    raise ValueError(f"unknown stream event: {event!r}")
