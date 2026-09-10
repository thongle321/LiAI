from typing import Protocol

from pydantic_ai.models import Model


class ChatProvider(Protocol):
    async def reply(self, message: str) -> str: ...

    def create_tool_model(self) -> Model | None:
        """Native tool-capable model, or None to use the FunctionModel echo."""
        return None
