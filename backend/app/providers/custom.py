"""BYOK custom endpoint: user-owned OpenAI-compatible API (ADR-004/006).

Explicit creds per instance, never env — the route builds one per request
from the transient byok object. Same CachedChatModel machinery as
OpenRouter, so chat and tools work unchanged against any compatible server.
"""

from pydantic_ai.providers.openai import OpenAIProvider

from .base import CachedChatModel, request_text


class CustomChatProvider(CachedChatModel):
    """OpenAI-compatible server at an explicit base URL with a user key."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._base_url = base_url
        self.api_key = api_key
        self.model_name = model

    def _prepare(self) -> None:
        if not self._base_url:
            raise RuntimeError("BYOK base_url must be set")
        if not self.api_key:
            raise RuntimeError("BYOK api_key must be set")
        if not self.model_name:
            raise RuntimeError("BYOK model must be set")

    def _provider(self) -> OpenAIProvider:
        return OpenAIProvider(base_url=self._base_url, api_key=self.api_key)

    async def reply(self, message: str) -> str:
        return await request_text(
            self._get_model(), message, empty_error="Custom provider returned no text"
        )
