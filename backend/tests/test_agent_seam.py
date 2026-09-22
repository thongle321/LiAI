"""Single patch point: app.agents.companion.get_companion_agent.

One seam for every caller (chat route, frame Q&A, lifespan). Tests patch
that one site; by-value imports elsewhere must not shadow it.
"""

from conftest import EchoProvider
from fastapi.testclient import TestClient

from app.agents.companion import get_companion_agent as build_agent
from app.main import app

client = TestClient(app)


def _echo_factory(*args: object, **kwargs: object):
    return build_agent(EchoProvider(), clock=kwargs.get("clock"))  # type: ignore[arg-type]


def test_single_patch_routes_chat(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.undo()  # wipe autouse echo routing; seam itself is single-site
    monkeypatch.setattr("app.agents.companion.get_companion_agent", _echo_factory)
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "Echo: hi"


def test_single_patch_routes_frame_qa(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import asyncio
    import io

    from PIL import Image

    from app.realtime import vlm
    from app.realtime.qa import answer_about_frame

    monkeypatch.undo()

    async def fake_describe(image: bytes, question: str) -> str:
        return "a red square"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)
    monkeypatch.setattr("app.agents.companion.get_companion_agent", _echo_factory)
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(buf, format="JPEG")
    reply, sid = asyncio.run(answer_about_frame("what?", buf.getvalue()))
    assert reply.startswith("Echo:")
    assert sid
