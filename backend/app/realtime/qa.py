"""Frame Q&A: JPEG + question in, stored companion reply out.

Pipeline: validate frame (fail-safe) → local VLM describes →
run_turn composes with personality/tools (existing companion agent,
no history) → same turn seam persists exactly user + final text.
"""

import io

from pydantic_ai import Agent

from ..modules.companion import append_assistant_text, get_store, run_turn
from . import vlm

MAX_FRAME_BYTES = 2 * 1024 * 1024

# ponytail: fixed narration prompt (Q1) — tunable later with continuous understanding
NARRATION_PROMPT = "Describe what you see."


def validate_jpeg(jpeg: bytes) -> None:
    """Shared ingestion guard (socket layer and qa use the same rule).

    Checks size, magic, and actual decodability so corrupt frames fail
    as invalid_request instead of surfacing as llm_error downstream.
    """
    if len(jpeg) > MAX_FRAME_BYTES:
        raise ValueError("frame exceeds size cap")
    if len(jpeg) < 4 or jpeg[0:3] != b"\xff\xd8\xff":
        raise ValueError("not a JPEG frame")
    from PIL import Image

    try:
        with Image.open(io.BytesIO(jpeg)) as picture:
            picture.load()
    except Exception:
        raise ValueError("undecodable JPEG frame") from None


async def answer_about_frame(
    question: str,
    jpeg: bytes,
    session_id: str | None = None,
    agent: Agent[None, str] | None = None,
) -> tuple[str, str]:
    if not question.strip():
        raise ValueError("question must not be empty")
    validate_jpeg(jpeg)
    seen = await vlm.describe_frame(jpeg, question)
    prompt = f"Question about the current camera view: {question}\nWhat the camera shows: {seen}"
    outcome = await run_turn(
        get_store(),
        session_id,
        question,
        prompt=prompt,
        use_history=False,
        agent=agent,
    )
    return outcome.reply, outcome.session_id


async def caption_frame(jpeg: bytes) -> str:
    """Describe the frame without persisting (tick dedups before storing)."""
    validate_jpeg(jpeg)
    return await vlm.describe_frame(jpeg, NARRATION_PROMPT)


def store_caption(caption: str, session_id: str | None = None) -> str:
    """Persist a caption as an assistant-only Turn; returns the session."""
    return append_assistant_text(caption, session_id)
