"""Models internals: private implementation, never imported cross-module.

Single module (not service.py + re-export): path-rule functions read the
shared MODELS_DIR, so tests patch exactly one namespace (app.shared.paths).
"""

from pathlib import Path

from ....shared import paths
from .hf import HfError, hf_files, hf_search


def safe_name(filename: str) -> str:
    """Strip any directory component — traversal defense."""
    return Path(filename).name


def is_gguf(filename: str) -> bool:
    return filename.lower().endswith(".gguf")


def path_for(filename: str) -> Path:
    return paths.MODELS_DIR / safe_name(filename)


def list_models() -> list[str]:
    return sorted(
        f.name for f in paths.MODELS_DIR.iterdir() if f.is_file() and is_gguf(f.name)
    )


__all__ = [
    "HfError",
    "hf_files",
    "hf_search",
    "is_gguf",
    "list_models",
    "path_for",
    "safe_name",
]
