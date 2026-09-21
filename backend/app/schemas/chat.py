from typing import Literal

from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    status: str = "ok"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None
    # Optional JPEG data-uri; when present the turn is answered by the VLM.
    image: str | None = None
    # Optional provider selection for dynamic model switching
    provider_type: Literal["openrouter", "custom_openai", "local_gguf"] | None = None
    model_name: str | None = None
    base_url: str | None = None  # For custom_openai
    api_key: str | None = None   # For custom_openai
    model_path: str | None = None  # For local_gguf (server-side path)

    @field_validator("message")
    @classmethod
    def _non_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message must not be empty")
        return v


class ChatResponse(BaseModel):
    reply: str
    session_id: str


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class HistoryResponse(BaseModel):
    session_id: str
    messages: list[HistoryMessage]


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ModelUploadResponse(BaseModel):
    filename: str
    size_bytes: int
    path: str


class ModelListResponse(BaseModel):
    models: list[str]