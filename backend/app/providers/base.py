from typing import Protocol

from pydantic_ai.messages import ModelRequest, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider


class ChatProvider(Protocol):
    """Unified interface for chat providers.

    One live adapter today (OpenRouter). Second adapter ships -> revisit.
    """
    model_name: str

    async def reply(self, message: str) -> str: ...

    def create_tool_model(self) -> Model | None:
        """Native tool-capable model for Pydantic AI agent, or None."""
        return None


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