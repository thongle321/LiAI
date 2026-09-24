"""Chat DTOs: request/response shapes owned by the chat module."""

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class SearchAuth(BaseModel):
    """Per-request web-search credentials (BYOK, ADR-004).

    Transient: the route maps this to the talent context and never stores
    or logs it. Field names avoid the provider-selection guardrail
    (provider_type/model_name/base_url/api_key/model_path): this selects
    a *search* backend, never inference.
    """

    provider: Literal["tavily", "brave"]
    key: str = Field(min_length=1)
    count: int = Field(default=5, ge=1, le=10)

    @model_validator(mode="after")
    def _key_not_blank(self) -> "SearchAuth":
        if not self.key.strip():
            raise ValueError("search key must not be blank")
        return self


class ByokAuth(BaseModel):
    """Per-request provider credentials (BYOK, ADR-004/006).

    Transient: the route maps this to the talent context and never stores
    or logs it. Nested (not top-level) by design: the guardrail test
    forbids top-level provider-selection names (provider_type, base_url,
    api_key, model_path...), and this is the ADR-006 vocabulary instead.
    provider mirrors the app's RemoteApiProvider values.
    """

    provider: Literal["custom_openai", "openrouter"]
    base_url: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    model: str = Field(min_length=1)

    @model_validator(mode="after")
    def _no_blanks(self) -> "ByokAuth":
        if (
            not self.base_url.strip()
            or not self.api_key.strip()
            or not self.model.strip()
        ):
            raise ValueError("byok fields must not be blank")
        return self


class ChatRequest(BaseModel):
    # None only on retry (regenerate reuses the stored question); the
    # validator below keeps every existing blank/missing 422 exactly.
    message: str | None = None
    session_id: str | None = None
    stream: bool = False
    retry: bool = False
    # Optional JPEG data-uri; when present the turn is answered by the VLM.
    image: str | None = None
    # Optional web-search credentials for the talent loop (Wave 2); the
    # client sends these only with consent + a stored key, per request.
    search: SearchAuth | None = None
    # Model selection (ADR-006): backend GGUF filename serves locally,
    # a provider-backed id routes by byok, absent means the default.
    model_id: str | None = None
    # Per-request BYOK creds for provider-backed ids; meaningless without
    # a selection, so the schema rejects it alone (422, like retry rules).
    byok: ByokAuth | None = None

    @model_validator(mode="after")
    def _message_rules(self) -> "ChatRequest":
        if self.byok is not None and self.model_id is None:
            raise ValueError("byok requires model_id")
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
    "ByokAuth",
    "ChatRequest",
    "ChatResponse",
    "HistoryMessage",
    "HistoryResponse",
    "SessionInfoResponse",
    "SessionListResponse",
    "SessionUpdateRequest",
]
