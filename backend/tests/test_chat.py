import asyncio

from _pytest.monkeypatch import MonkeyPatch
from conftest import EchoProvider
from fastapi.testclient import TestClient

from app.agents import get_companion_agent
from app.config.personality import COMPANION_SYSTEM_PROMPT
from app.main import app
from app.providers.factory import get_provider
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


def test_chat_image_rejects_non_jpeg_bytes(monkeypatch: MonkeyPatch) -> None:
    import base64

    from app.realtime import vlm as vlm_module

    def _boom(image: bytes, question: str) -> str:
        raise AssertionError("validation must reject before inference")

    monkeypatch.setattr(vlm_module, "describe_frame", _boom)
    payload = base64.b64encode(b"not a jpeg").decode()
    resp = client.post(
        "/api/chat", json={"message": "what is this?", "image": payload}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_request"


def test_chat_image_rejects_bad_base64() -> None:
    resp = client.post(
        "/api/chat", json={"message": "what is this?", "image": "!!!"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_request"


def test_chat_image_routes_to_vlm(monkeypatch: MonkeyPatch) -> None:
    import base64
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(buf, format="JPEG")
    jpeg = buf.getvalue()
    seen: dict[str, object] = {}

    async def fake_describe(image: bytes, question: str) -> str:
        seen["image"] = image
        seen["question"] = question
        return "a red mug"

    monkeypatch.setattr("app.realtime.vlm.describe_frame", fake_describe)
    payload = base64.b64encode(jpeg).decode()
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
    assert seen == {"image": jpeg, "question": "what is this?"}


def test_old_chat_route_dropped() -> None:
    assert client.post("/chat", json={"message": "hi"}).status_code == 404


def test_personality_config_is_non_blank() -> None:
    assert isinstance(COMPANION_SYSTEM_PROMPT, str)
    assert COMPANION_SYSTEM_PROMPT.strip() != ""


def test_agent_run_replies_through_provider() -> None:
    result = asyncio.run(get_companion_agent(EchoProvider()).run("hi"))
    assert result.output == "Echo: hi"


def test_factory_defaults_to_openrouter() -> None:
    assert isinstance(get_provider(), OpenRouterChatProvider)


def test_provider_surface_is_openrouter_only() -> None:
    """One real adapter: dead branches and their types must not exist."""
    from app import providers

    assert not hasattr(providers, "CustomOpenAIChatProvider")
    assert not hasattr(providers, "LocalLlamaCppProvider")
    assert not hasattr(providers, "ProviderConfig")
    assert not hasattr(providers, "ProviderStrategyFactory")


def test_chat_request_has_no_provider_selection_fields() -> None:
    from app.schemas.chat import ChatRequest

    for field in ("provider_type", "model_name", "base_url", "api_key", "model_path"):
        assert field not in ChatRequest.model_fields


def test_openrouter_missing_key_raises(monkeypatch: MonkeyPatch) -> None:
    import asyncio

    # Isolate from the import-time .env autoload: "" must mean no key.
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    async def reply_without_key() -> None:
        await OpenRouterChatProvider(api_key="", model="x").reply("hi")

    try:
        asyncio.run(reply_without_key())
    except RuntimeError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
