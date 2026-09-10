from typing import Protocol


class ChatProvider(Protocol):
    async def reply(self, message: str) -> str: ...
