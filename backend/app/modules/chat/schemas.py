"""Chat DTOs: request/response shapes owned by the chat module."""

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class ChatRequest(BaseModel):
    # None only on retry (regenerate reuses the stored question); the
    # validator below keeps every existing blank/missing 422 exactly.
    message: str | None = None
    session_id: str | None = None
    stream: bool = False
    retry: bool = False
    # Optional JPEG data-uri; when present the turn is answered by the VLM.
    image: str | None = None

    @model_validator(mode="after")
    def _message_rules(self) -> "ChatRequest":
        if self.retry and not self.stream:
            raise ValueError("retry requires stream")
        if self.retry:
            if self.message is not None:
                raise ValueError("retry takes no message")
            if self.image is not None:
                raise ValueError("retry takes no image; resend image turns anew")
            return self
        if self.message is None or not self.message.strip():
            raise ValueError("message must not be empty")
        return self


class ChatResponse(BaseModel):
    reply: str
    session_id: str


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    # Structural turn metadata (tool names, usage) when the turn has any;
    # readers replaying history ignore it. Absent stays absent on the wire.
    metadata: dict[str, Any] | None = None


class HistoryResponse(BaseModel):
    session_id: str
    messages: list[HistoryMessage]


class SessionInfoResponse(BaseModel):
    id: str
    title: str
    pinned: bool
    updated_at: str


class SessionListResponse(BaseModel):
    sessions: list[SessionInfoResponse]


class SessionUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    pinned: bool | None = None

    @model_validator(mode="after")
    def _at_least_one(self) -> "SessionUpdateRequest":
        if self.title is None and self.pinned is None:
            raise ValueError("nothing to update: set title and/or pinned")
        return self


__all__ = [
    "ChatRequest",
    "ChatResponse",
    "HistoryMessage",
    "HistoryResponse",
    "SessionInfoResponse",
    "SessionListResponse",
    "SessionUpdateRequest",
]
