"""Provider selection: single seam, single adapter (OpenRouter).

 ponytail: one real adapter today (OpenRouter). When a second live
 adapter ships (e.g., Anthropic, local llama), reintroduce a small
 factory/config seam here — do not branch inline in callers.
"""

from ..config import boot  # noqa: F401 — .env side effect; single load lives in boot
from .base import ChatProvider
from .openrouter import OpenRouterChatProvider


def get_provider() -> ChatProvider:
    """Return the single production provider (OpenRouter).

    Lazy singleton so tests can call `clear_provider_cache()` and re-read env.
    """
    global _cached_provider
    if _cached_provider is None:
        _cached_provider = OpenRouterChatProvider()
    return _cached_provider


def clear_provider_cache() -> None:
    """Drop the cached provider so the next `get_provider()` re-reads env."""
    global _cached_provider
    _cached_provider = None


_cached_provider: ChatProvider | None = None
