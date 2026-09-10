from collections.abc import Awaitable, Callable
from datetime import datetime

from pydantic_ai import Agent, RunContext
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


def get_companion_agent(
    provider: ChatProvider | None = None,
    *,
    clock: Callable[[], str] | None = None,
) -> Agent:
    provider = provider if provider is not None else get_provider()
    # ponytail: injectable clock so tool tests never touch the wall clock
    current_time = clock if clock is not None else _local_time
    model = FunctionModel(provider_function(provider), model_name="liai-provider")
    agent = Agent(model, system_prompt=COMPANION_SYSTEM_PROMPT)

    @agent.tool
    def get_current_time(_ctx: RunContext[None]) -> str:
        """Return the current local time as an ISO-8601 string."""
        return current_time()

    return agent


def _local_time() -> str:
    return datetime.now().astimezone().isoformat()
