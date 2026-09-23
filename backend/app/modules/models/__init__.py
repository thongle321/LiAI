"""Models module: GGUF file service + routes. Public surface (re-export only)."""

from .internal import MODELS_DIR, is_gguf, list_models, path_for, safe_name
from .router import router

__all__ = [
    "MODELS_DIR",
    "is_gguf",
    "list_models",
    "path_for",
    "router",
    "safe_name",
]
