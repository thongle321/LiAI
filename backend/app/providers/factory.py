import os

from .base import ChatProvider
from .fake import FakeProvider
from .openrouter import OpenRouterChatProvider


def get_provider() -> ChatProvider:
    name = os.getenv("LLM_PROVIDER", "fake").strip().lower()
    if name in ("openrouter", "openai", "openai-compatible", "openai_compat"):
        return OpenRouterChatProvider()
    return FakeProvider()
