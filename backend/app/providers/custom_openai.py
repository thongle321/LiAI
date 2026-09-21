import os

from pydantic_ai.providers.openai import OpenAIProvider

from .base import CachedChatModel, ProviderConfig, request_text


class CustomOpenAIChatProvider(CachedChatModel):
    """Custom OpenAI-compatible provider for any OpenAI-compatible API endpoint.
    
    Supports endpoints like:
    - vLLM
    - Ollama (with /v1 endpoint)
    - LM Studio
    - LocalAI
    - Any OpenAI-compatible API
    """

    def __init__(
        self,
        base_url: str,
        api_key: str = "not-required",
        model: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_name = model or os.getenv("CUSTOM_OPENAI_MODEL", "local-model")
        self.provider_type = "custom_openai"

    def _provider(self) -> OpenAIProvider:
        return OpenAIProvider(base_url=f"{self.base_url}/v1", api_key=self.api_key)

    async def reply(self, message: str) -> str:
        return await request_text(
            self._get_model(), message, empty_error="Custom OpenAI provider returned no text"
        )

    @classmethod
    def from_config(cls, config: ProviderConfig) -> "CustomOpenAIChatProvider":
        """Create provider from ProviderConfig."""
        return cls(
            base_url=config.base_url or "",
            api_key=config.api_key or "not-required",
            model=config.model_name,
        )