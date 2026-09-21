import os
from pathlib import Path

from .base import ChatProvider, ProviderConfig
from .custom_openai import CustomOpenAIChatProvider
from .local_llamacpp import LocalLlamaCppProvider
from .openrouter import OpenRouterChatProvider

_DOTENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def _load_dotenv(path: Path = _DOTENV_PATH) -> None:
    """Minimal .env loader (stdlib only): KEY=VALUE lines, process env wins.

    Plain `python`/`uvicorn` never reads backend/.env — only
    `uv run --env-file .env` injects it. Without this, every other
    launch booted keyless and died in lifespan with a bare SDK
    UserError even though the key sat in backend/.env.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


class ProviderStrategyFactory:
    """Factory for creating and managing chat provider strategies.
    
    Supports dynamic provider selection at request time based on
    provider type and configuration.
    """

    _provider_cache: dict[str, ChatProvider] = {}

    @classmethod
    def create_provider(cls, config: ProviderConfig) -> ChatProvider:
        """Create a provider instance from configuration."""
        if config.provider_type == "openrouter":
            return OpenRouterChatProvider(
                api_key=config.api_key,
                model=config.model_name,
            )
        elif config.provider_type == "custom_openai":
            return CustomOpenAIChatProvider.from_config(config)
        elif config.provider_type == "local_gguf":
            return LocalLlamaCppProvider.from_config(config)
        else:
            raise ValueError(f"Unknown provider type: {config.provider_type}")

    @classmethod
    def get_default_provider(cls) -> ChatProvider:
        """Get the default provider (OpenRouter) for backwards compatibility."""
        cache_key = "default_openrouter"
        if cache_key not in cls._provider_cache:
            cls._provider_cache[cache_key] = OpenRouterChatProvider()
        return cls._provider_cache[cache_key]

    @classmethod
    def get_provider_for_request(
        cls,
        provider_type: str | None = None,
        model_name: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        model_path: str | None = None,
        **kwargs,
    ) -> ChatProvider:
        """Get a provider instance for a specific request.
        
        Args:
            provider_type: Type of provider ("openrouter", "custom_openai", "local_gguf")
            model_name: Name of the model to use
            base_url: Base URL for custom OpenAI-compatible endpoints
            api_key: API key for the provider
            model_path: Path to local GGUF model file
            **kwargs: Additional provider-specific parameters
            
        Returns:
            ChatProvider instance
        """
        # Default to OpenRouter if no provider specified
        if not provider_type or provider_type == "openrouter":
            return cls.get_default_provider()

        # Create config from request parameters
        config = ProviderConfig(
            provider_type=provider_type,  # type: ignore
            model_name=model_name or "",
            base_url=base_url,
            api_key=api_key,
            model_path=model_path,
            **kwargs,
        )

        cache_key = f"{provider_type}:{model_name}:{base_url}:{model_path}"
        if cache_key not in cls._provider_cache:
            cls._provider_cache[cache_key] = cls.create_provider(config)

        return cls._provider_cache[cache_key]

    @classmethod
    def clear_cache(cls) -> None:
        """Clear the provider cache (useful for testing or config changes)."""
        # Shutdown any local llama-cpp servers
        for provider in cls._provider_cache.values():
            if hasattr(provider, "shutdown"):
                provider.shutdown()
        cls._provider_cache.clear()


# Backwards compatibility
def get_provider() -> ChatProvider:
    """Production selector: OpenRouter only, key required.

    No keyless fallback — a missing key fails fast at agent build
    (lifespan crashes the boot; requests would 502). Tests inject
    their own provider and never touch this default.
    """
    return ProviderStrategyFactory.get_default_provider()