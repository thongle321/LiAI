"""Frame Q&A: JPEG + question in, stored companion reply out.

Pipeline: validate frame (fail-safe) → local VLM describes →
run_turn composes with personality/tools (existing companion agent,
no history) → same turn seam persists exactly user + final text.
"""

from pydantic_ai import Agent

from ...companion import append_assistant_text, get_store, run_turn
from ....shared.ports import ConversationStore
from ....shared.validators import validate_jpeg
from ....shared import vlm

# ponytail: fixed narration prompt (Q1) — tunable later with continuous understanding
NARRATION_PROMPT = "Describe what you see."


async def answer_about_frame(
    question: str,
    jpeg: bytes,
    session_id: str | None = None,
    agent: Agent[None, str] | None = None,
    store: ConversationStore | None = None,
) -> tuple[str, str]:
    if not question.strip():
        raise ValueError("question must not be empty")
    validate_jpeg(jpeg)
    seen = await vlm.describe_frame(jpeg, question)
    prompt = f"Question about the current camera view: {question}\nWhat the camera shows: {seen}"
    outcome = await run_turn(
        store or get_store(),
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
