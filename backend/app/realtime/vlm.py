"""VLM boundary: question about the live view in, description out.

Production backend is Vision Agents' TransformersVLM
(LFM2.5-VL-450M, local, CPU). Frames reach it from the watched call
track (framework-owned buffer); this seam only asks and collects the
final text. CI monkeypatches ask_view with a stub; the heavy stack
stays lazy so collection never needs weights.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from vision_agents.plugins.huggingface import TransformersVLM

_vlm: TransformersVLM | None = None


def set_vlm(instance: TransformersVLM) -> None:
    """Share one loaded VLM (the call agent registers its own)."""
    global _vlm
    _vlm = instance


def get_vlm() -> TransformersVLM:
    global _vlm
    if _vlm is None:
        try:
            from vision_agents.plugins import huggingface
        except ImportError as exc:
            raise RuntimeError("VLM backend not configured") from exc
        _vlm = huggingface.TransformersVLM(
            model="LiquidAI/LFM2.5-VL-450M",
            device="cpu",
            fps=1,
            frame_buffer_seconds=10,
        )
    return _vlm


async def ask_view(question: str) -> str:
    chunks: list[str] = []
    async for delta in get_vlm().simple_response(question):
        text = getattr(delta, "text", "") or ""
        if text:
            chunks.append(text)
    return "".join(chunks)
