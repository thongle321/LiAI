from pathlib import Path

_DOTENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


def _load_dotenv(path: Path = _DOTENV_PATH) -> None:
    """Load `.env` from the backend root into `os.environ` without overriding
    existing environment variables.

    Stdlib parser (backend/AGENTS.md: no dependency for this). Explicit
    environment always wins over the file.
    """
    if not path.is_file():
        return
    import os

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


# Import-time side effect: loading .env when first imported, so callers
# (factory, main) get OPENROUTER_API_KEY without an explicit call.
_load_dotenv()
