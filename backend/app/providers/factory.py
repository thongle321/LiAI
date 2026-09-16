from .base import ChatProvider
from .openrouter import OpenRouterChatProvider


def get_provider() -> ChatProvider:
    """Production selector: OpenRouter only, key required.

    No keyless fallback — a missing key fails fast at agent build
    (lifespan crashes the boot; requests would 502). Tests inject
    their own provider and never touch this default.
    """
    return OpenRouterChatProvider()
