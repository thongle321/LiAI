"""Frame Q&A: user question in, stored companion reply out.

Pipeline: local VLM describes the live view (framework-fed frames) →
Pydantic AI composes with personality/tools (existing companion agent)
→ existing store persists exactly user + final text (Q6 transcript
rule carries over). Malformed input fails before the VLM (fail-safe).
"""

from ..agents import get_companion_agent
from ..memory import Turn, get_store
from .vlm import ask_view


async def answer_about_view(question: str) -> tuple[str, str]:
    if not question.strip():
        raise ValueError("question must not be empty")
    seen = await ask_view(question)
    prompt = f"Question about the current camera view: {question}\nWhat the camera shows: {seen}"
    result = await get_companion_agent().run(prompt)
    reply = str(result.output)
    session_id = get_store().create()
    get_store().append(session_id, Turn(role="user", content=question))
    get_store().append(session_id, Turn(role="assistant", content=reply))
    return reply, session_id
