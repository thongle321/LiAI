from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic_ai.messages import ModelRequest, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider


class ChatProvider(Protocol):
    """Unified interface for all chat providers.

    Both local (GGUF) and remote (OpenRouter, custom OpenAI-compatible) providers
    implement this interface to allow dynamic selection at request time.
    """
    provider_type: Literal["openrouter", "custom_openai", "local_gguf"]
    model_name: str
    
    async def reply(self, message: str) -> str: ...

    def create_tool_model(self) -> Model | None:
        """Native tool-capable model for Pydantic AI agent, or None."""
        return None


@dataclass
class ProviderConfig:
    """Configuration for a provider, used for dynamic provider selection."""
    provider_type: Literal["openrouter", "custom_openai", "local_gguf"]
    model_name: str
    # For custom_openai
    base_url: str | None = None
    api_key: str | None = None
    # For local_gguf
    model_path: str | None = None
    n_ctx: int = 4096
    n_gpu_layers: int = 0
    n_threads: int | None = None
    verbose: bool = False


class CachedChatModel:
    """One lazy OpenAI-compatible model, shared by all providers.

    Subclasses supply _provider(); override _prepare() for key checks
    or server startup. Stops each provider re-implementing the cache.
    """

    _model: OpenAIChatModel | None = None
    model_name: str

    def _prepare(self) -> None:
        """Per-provider setup before first model build (default: none)."""

    def _provider(self) -> OpenAIProvider:
        raise NotImplementedError

    def _get_model(self) -> OpenAIChatModel:
        self._prepare()
        if self._model is None:
            self._model = OpenAIChatModel(self.model_name, provider=self._provider())
        return self._model

    def create_tool_model(self) -> OpenAIChatModel:
        """Native tool-capable model for the agent path."""
        return self._get_model()


async def request_text(model: OpenAIChatModel, message: str, *, empty_error: str) -> str:
    """One request + first-TextPart extraction, shared by all providers."""
    response = await model.request(ModelRequest(parts=[UserPromptPart(content=message)]))
    for part in response.parts:
        if isinstance(part, TextPart):
            return part.content
    raise RuntimeError(empty_error)