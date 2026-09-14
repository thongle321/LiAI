import asyncio

from _pytest.monkeypatch import MonkeyPatch
from fastapi.testclient import TestClient

from app.agents import get_companion_agent
from app.config.personality import COMPANION_SYSTEM_PROMPT
from app.main import app
from app.providers.factory import get_provider
from app.providers.fake import FakeProvider
from app.providers.openrouter import OpenRouterChatProvider

client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_chat_fake_default() -> None:
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == "Echo: hi"
    assert isinstance(body["session_id"], str) and body["session_id"] != ""


def test_chat_rejects_missing_and_blank() -> None:
    assert client.post("/api/chat", json={}).status_code == 422
    assert client.post("/api/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/chat", json={"message": "   "}).status_code == 422


def test_chat_image_rejects_bad_base64() -> None:
    resp = client.post(
        "/api/chat", json={"message": "what is this?", "image": "!!!"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_request"


def test_chat_image_routes_to_vlm(monkeypatch: MonkeyPatch) -> None:
    import base64

    seen: dict[str, object] = {}

    async def fake_describe(image: bytes, question: str) -> str:
        seen["image"] = image
        seen["question"] = question
        return "a red mug"

    monkeypatch.setattr("app.realtime.vlm.describe_frame", fake_describe)
    payload = base64.b64encode(b"fake-jpeg-bytes").decode()
    resp = client.post(
        "/api/chat",
        json={
            "message": "what is this?",
            "image": f"data:image/jpeg;base64,{payload}",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["reply"] == "a red mug"
    assert seen == {"image": b"fake-jpeg-bytes", "question": "what is this?"}


def test_old_chat_route_dropped() -> None:
    assert client.post("/chat", json={"message": "hi"}).status_code == 404


def test_personality_config_is_non_blank() -> None:
    assert isinstance(COMPANION_SYSTEM_PROMPT, str)
    assert COMPANION_SYSTEM_PROMPT.strip() != ""


def test_agent_run_replies_through_provider() -> None:
    result = asyncio.run(get_companion_agent().run("hi"))
    assert result.output == "Echo: hi"


def test_factory_defaults_to_fake(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert isinstance(get_provider(), FakeProvider)


def test_factory_selects_openrouter(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    assert isinstance(get_provider(), OpenRouterChatProvider)


def test_factory_legacy_alias_selects_openrouter(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openai-compatible")
    assert isinstance(get_provider(), OpenRouterChatProvider)


def test_openrouter_missing_key_raises() -> None:
    import asyncio

    async def reply_without_key() -> None:
        await OpenRouterChatProvider(api_key="", model="x").reply("hi")

    try:
        asyncio.run(reply_without_key())
    except RuntimeError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
