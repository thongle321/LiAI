"""Shared filesystem locations (ADR-002 kernel: truly shared by ≥2 owners).

MODELS_DIR is read by the models module (uploads/list/delete), the
provider factory (GGUF resolution), and the chat route (via resolve) —
one definition so tests patch exactly one namespace (app.shared.paths).
"""

from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

__all__ = ["MODELS_DIR"]
