import os

from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from .base import CachedChatModel, request_text


class OpenRouterChatProvider(CachedChatModel):
    """OpenRouter via the official pydantic-ai-slim integration.

    Same ChatProvider seam as before; the hand-rolled httpx code is gone.
    Swapped in via env without touching the route contract.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.api_key = (
            api_key or os.getenv("OPENROUTER_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
        )
        self.model_name = (
            model or os.getenv("OPENROUTER_MODEL", "") or os.getenv("OPENAI_MODEL", "openai/gpt-4o-mini")
        )

    def _prepare(self) -> None:
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY must be set")

    def _provider(self) -> OpenRouterProvider:
        return OpenRouterProvider(api_key=self.api_key)

    def create_tool_model(self) -> OpenRouterModel:
        """Native tool-capable model for the agent path (Q1-D wiring).

        Needs a key at build time (the SDK validates eagerly); makes no
        network calls until the first request. A missing/invalid key
        fails the turn and surfaces as llm_error 502 via main.py.
        """
        if not self.api_key:
            from pydantic_ai.exceptions import UserError
            raise UserError(
                "OPENROUTER_API_KEY must be set to use OpenRouter provider"
            )
        return OpenRouterModel(self.model_name, provider=self._provider())

    async def reply(self, message: str) -> str:
        return await request_text(
            self._get_model(), message, empty_error="OpenRouter returned no text"
        )