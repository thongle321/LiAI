"""Single seam: app.dependency_overrides[agent_dependency].

No caller patches the factory. Route tests override the Depends target;
frame Q&A takes an explicit agent; unit tests use pydantic-ai's
Agent.override. Tests prove all three paths; by-value imports elsewhere
must not shadow the seam.
"""

import asyncio

from conftest import EchoProvider
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.main import app
from app.modules.companion import get_companion_agent as build_agent

client = TestClient(app)


def test_single_override_routes_chat() -> None:
    # Autouse echo override (conftest) resolves through the Depends seam.
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"


def test_explicit_agent_routes_frame_qa() -> None:
    import io

    from PIL import Image

    from app.modules.companion import get_store
    from app.realtime import vlm
    from app.realtime.qa import answer_about_frame

    real_describe = vlm.describe_frame

    async def fake_describe(image: bytes, question: str) -> str:
        return "a red square"

    vlm.describe_frame = fake_describe  # type: ignore[method-assign]
    try:
        buf = io.BytesIO()
        Image.new("RGB", (8, 8), (255, 0, 0)).save(buf, format="JPEG")
        reply, sid = asyncio.run(
            answer_about_frame(
                "what?", buf.getvalue(), agent=build_agent(EchoProvider())
            )
        )
    finally:
        vlm.describe_frame = real_describe  # type: ignore[method-assign]
    assert reply.startswith("Echo:")
    assert sid
    assert get_store() is not None


def test_framework_override_changes_model() -> None:
    """Agent.override (pydantic-ai seam) swaps the model with no app patching."""

    async def fixed(
        messages: object, _info: AgentInfo
    ) -> ModelResponse:
        return ModelResponse(parts=[TextPart("OVERRIDDEN")])

    async def _go() -> str:
        agent = build_agent(EchoProvider())
        with agent.override(model=FunctionModel(fixed)):  # type: ignore[arg-type]
            result = await agent.run("hi")
        output = result.output
        assert isinstance(output, str)
        return output

    assert asyncio.run(_go()) == "OVERRIDDEN"
