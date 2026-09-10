from collections.abc import Awaitable, Callable

from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from ..config.personality import COMPANION_SYSTEM_PROMPT
from ..memory import Turn
from ..providers import ChatProvider, get_provider


def latest_user_text(messages: list[ModelMessage]) -> str:
    text = ""
    for message in messages:
        for part in message.parts:
            if isinstance(part, UserPromptPart) and isinstance(part.content, str):
                text = part.content
    return text


def provider_function(
    provider: ChatProvider,
) -> Callable[[list[ModelMessage], AgentInfo], Awaitable[ModelResponse]]:
    async def run(messages: list[ModelMessage], _info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart(await provider.reply(latest_user_text(messages)))])  # fmt: skip

    return run


def to_message_history(turns: list[Turn]) -> list[ModelMessage]:
    """Agent-boundary adapter: portable turns in, framework messages out."""
    history: list[ModelMessage] = []
    for turn in turns:
        if turn.role == "assistant":
            history.append(ModelResponse(parts=[TextPart(turn.content)]))
        else:
            history.append(ModelRequest(parts=[UserPromptPart(turn.content)]))
    return history


def get_companion_agent(provider: ChatProvider | None = None) -> Agent:
    provider = provider if provider is not None else get_provider()
    model = FunctionModel(provider_function(provider), model_name="liai-provider")
    return Agent(model, system_prompt=COMPANION_SYSTEM_PROMPT)
