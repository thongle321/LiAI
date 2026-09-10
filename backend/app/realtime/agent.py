"""Realtime vision agent worker (live only — needs edge creds + a call).

Vision Agents owns capture/transport; the local LFM VLM sees frames;
qa.answer_about_view composes via Pydantic AI and persists text.
Questions arrive as liai.question call events; replies go back as
liai.answer events. Run next to FastAPI, one worker per call:
  uv run python -m app.realtime.agent <call_id>
"""

import asyncio
import sys

from vision_agents.core import Agent, User
from vision_agents.plugins import getstream, huggingface

import app.realtime.vlm as vlm
from .qa import answer_about_view


def _custom_payload(event: object) -> dict | None:
    if isinstance(event, dict):
        custom = event.get("custom")
    else:
        custom = getattr(event, "custom", None)
    return custom if isinstance(custom, dict) else None


def _handler(agent: Agent):  # type: ignore[no-untyped-def]
    async def on_event(event: object) -> None:
        custom = _custom_payload(event)
        if custom is None or custom.get("type") != "liai.question":
            return
        question = custom.get("text", "")
        if not isinstance(question, str) or not question.strip():
            return
        reply, _ = await answer_about_view(question)
        agent.send_custom_event({"type": "liai.answer", "text": reply})

    return on_event


async def run_call_agent(call_id: str) -> None:
    shared_vlm = huggingface.TransformersVLM(
        model="LiquidAI/LFM2.5-VL-450M",
        device="cpu",
        fps=1,
        frame_buffer_seconds=10,
    )
    vlm.set_vlm(shared_vlm)
    agent = Agent(
        edge=getstream.Edge(),
        agent_user=User(name="LiAI", id=f"agent-{call_id}"),
        instructions="You are a visual assistant. Describe what you see.",
        llm=shared_vlm,
    )
    agent.subscribe(_handler(agent))
    async for _ in agent.join(agent.create_call("default", call_id)):
        pass


if __name__ == "__main__":
    asyncio.run(run_call_agent(sys.argv[1]))
