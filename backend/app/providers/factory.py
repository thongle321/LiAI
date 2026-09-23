"""Provider selection: default singleton plus per-request resolve().

The default stays OpenRouter (app-owned key); resolve(model_id, byok)
picks the turn's runtime — local GGUF, BYOK endpoint, or default.
"""

from dataclasses import dataclass
from pathlib import Path

from ..config import boot  # noqa: F401 — .env side effect; single load lives in boot
from ..shared import paths
from .base import ChatProvider
from .custom import CustomChatProvider
from .llamacpp import LlamaCppChatProvider
from .openrouter import OpenRouterChatProvider


@dataclass(frozen=True)
class ByokContext:
    """Per-request provider credentials (BYOK, ADR-004/006).

    Transient: built from the chat body per request, never persisted or
    logged. provider mirrors the app's RemoteApiProvider vocabulary.
    """

    provider: str
    base_url: str
    api_key: str
    model: str


class UnknownModelError(Exception):
    """model_id resolves to nothing; routes map it to 400."""


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


def resolve(model_id: str | None, byok: ByokContext | None) -> ChatProvider:
    """Per-request provider selection (ADR-006).

    None → the app-owned default. A model_id naming a backend .gguf file
    serves it locally (files always win — explicit local beats creds).
    Otherwise a byok routes to the user's endpoint: the native OpenRouter
    integration for openrouter, a generic OpenAI-compatible client for
    anything else. A bare unknown id is a client bug (400 downstream).
    """
    if model_id is not None:
        candidate = paths.MODELS_DIR / Path(model_id).name
        if candidate.suffix.lower() == ".gguf" and candidate.is_file():
            return LlamaCppChatProvider(candidate)
    if byok is not None:
        if byok.provider == "openrouter":
            return OpenRouterChatProvider(api_key=byok.api_key, model=byok.model)
        return CustomChatProvider(
            base_url=byok.base_url, api_key=byok.api_key, model=byok.model
        )
    if model_id is not None:
        raise UnknownModelError(
            f"unknown model_id: {model_id!r} (upload the GGUF or attach byok)"
        )
    return get_provider()


_cached_provider: ChatProvider | None = None
