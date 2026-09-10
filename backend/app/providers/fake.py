from .base import ChatProvider


class FakeProvider(ChatProvider):
    """Zero-key default. Deterministic so the contract test is stable."""

    async def reply(self, message: str) -> str:
        return f"Echo: {message}"
