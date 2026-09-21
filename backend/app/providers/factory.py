import os
from pathlib import Path

from .base import ChatProvider
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


def get_provider() -> ChatProvider:
    """Production selector: OpenRouter only, key required.

    No keyless fallback — a missing key fails fast at agent build
    (lifespan crashes the boot; requests would 502). Tests inject
    their own provider and never touch this default.
    """
    return OpenRouterChatProvider()
