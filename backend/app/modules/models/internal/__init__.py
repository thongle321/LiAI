"""Models internals: private implementation, never imported cross-module.

Single module (not service.py + re-export): the path-rule functions read the
module global MODELS_DIR, so tests patch exactly one namespace.
"""

from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parents[4] / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def safe_name(filename: str) -> str:
    """Strip any directory component — traversal defense."""
    return Path(filename).name


def is_gguf(filename: str) -> bool:
    return filename.lower().endswith(".gguf")


def path_for(filename: str) -> Path:
    return MODELS_DIR / safe_name(filename)


def list_models() -> list[str]:
    return sorted(
        f.name for f in MODELS_DIR.iterdir() if f.is_file() and is_gguf(f.name)
    )


__all__ = ["MODELS_DIR", "is_gguf", "list_models", "path_for", "safe_name"]
