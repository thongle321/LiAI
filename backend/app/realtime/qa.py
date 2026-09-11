"""Frame Q&A: JPEG + question in, stored companion reply out.

Pipeline: validate frame (fail-safe) → local VLM describes →
Pydantic AI composes with personality/tools (existing companion agent)
→ existing store persists exactly user + final text.
"""

from ..agents import get_companion_agent
from ..memory import Turn, get_store
from . import vlm

MAX_FRAME_BYTES = 2 * 1024 * 1024


def validate_jpeg(jpeg: bytes) -> None:
    """Shared ingestion guard (socket layer and qa use the same rule)."""
    if len(jpeg) > MAX_FRAME_BYTES:
        raise ValueError("frame exceeds size cap")
    if len(jpeg) < 4 or jpeg[0:3] != b"\xff\xd8\xff":
        raise ValueError("not a JPEG frame")


async def answer_about_frame(
    question: str, jpeg: bytes, session_id: str | None = None
) -> tuple[str, str]:
    if not question.strip():
        raise ValueError("question must not be empty")
    validate_jpeg(jpeg)
    seen = await vlm.describe_frame(jpeg, question)
    prompt = f"Question about the current camera view: {question}\nWhat the camera shows: {seen}"
    result = await get_companion_agent().run(prompt)
    reply = str(result.output)
    store = get_store()
    session_id = session_id or store.create()
    store.append(session_id, Turn(role="user", content=question))
    store.append(session_id, Turn(role="assistant", content=reply))
    return reply, session_id
