"""Companion agent: portable turns at the boundary, framework messages inside.

The single factory seam every caller resolves through (tests override the
model via pydantic-ai's Agent.override, not by patching this factory).
"""

from collections.abc import Awaitable, Callable

from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from ...config.personality import COMPANION_SYSTEM_PROMPT
from ...providers import ChatProvider, get_provider
from ...shared.ports import ConversationStore, Turn
from .tools import local_time as _local_time


def assistant_text(output: object) -> str:
    """Reply text for the mobile bubble: tool calls never render.

    The agent loop resolves tool calls internally, but a turn ending
    on bare tool machinery (or a future non-text output) must not
    leak it into chat — extract text parts only.
    """
    if isinstance(output, str):
        return output
    if isinstance(output, list):
        return "".join(
            part.content for part in output if isinstance(part, TextPart)
        )
    return str(output)


def persist_turn(
    store: ConversationStore,
    session_id: str | None,
    user_text: str,
    reply: str,
    tool_names: list[str] | None = None,
) -> str:
    """One stored turn: mint the session when needed, then user + final text.

    The single place both chat routes persist, so tool internals can
    never land in history content — only the text the mobile bubble rendered.
    Structural tool *names* may ride in assistant metadata (never args or
    results); readers that replay history ignore metadata entirely.
    """
    session_id = session_id or store.create()
    store.append(session_id, Turn(role="user", content=user_text))
    store.append(
        session_id,
        Turn(
            role="assistant",
            content=reply,
            metadata={"tool_calls": tool_names} if tool_names else None,
        ),
    )
    return session_id


def tool_names(messages: list[ModelMessage]) -> list[str]:
    """Tool names invoked across agent messages, in order, deduplicated."""
    names: list[str] = []
    for message in messages:
        for part in message.parts:
            if isinstance(part, ToolCallPart) and part.tool_name not in names:
                names.append(part.tool_name)
    return names


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
) -> Agent[None, str]:
    provider = provider if provider is not None else get_provider()
    # ponytail: injectable clock so tool tests never touch the wall clock
    current_time = clock if clock is not None else _local_time
    # ponytail: native model drives the tool loop for providers that
    # offer one; others keep the deterministic FunctionModel echo
    agent: Agent[None, str] = Agent(
        provider.create_tool_model()
        or FunctionModel(provider_function(provider), model_name="liai-provider"),
        system_prompt=COMPANION_SYSTEM_PROMPT,
    )

    @agent.tool
    def get_current_time(_ctx: RunContext[None]) -> str:
        """Return the current local time as an ISO-8601 string."""
        return current_time()

    return agent


def agent_dependency() -> Agent[None, str]:
    """Zero-arg Depends target (factory params are not request params)."""
    return get_companion_agent()
