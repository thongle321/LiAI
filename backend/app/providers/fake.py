class FakeProvider:
    """Zero-key default. Deterministic so the contract test is stable."""

    async def reply(self, message: str) -> str:
        return f"Echo: {message}"
