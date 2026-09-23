"""Server-side GGUF files: sanitize, store, list, delete.

One place for the path rules (traversal strip, .gguf allowlist) so the
routes stay thin wiring and the pure decisions are testable without HTTP.
"""

from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
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
