import os

from pydantic_ai.messages import ModelRequest, TextPart, UserPromptPart
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider


class OpenRouterChatProvider:
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
        self._model: OpenAIChatModel | None = None

    def _get_model(self) -> OpenAIChatModel:
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY must be set")
        if self._model is None:
            provider = OpenRouterProvider(api_key=self.api_key)
            self._model = OpenAIChatModel(self.model_name, provider=provider)
        return self._model

    async def reply(self, message: str) -> str:
        response = await self._get_model().request(
            ModelRequest(parts=[UserPromptPart(content=message)])
        )
        for part in response.parts:
            if isinstance(part, TextPart):
                return part.content
        raise RuntimeError("OpenRouter returned no text")
