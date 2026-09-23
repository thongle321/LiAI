"""Chat model selection: model_id/byok contract + GGUF serving (Wave 3).

resolve() picks the runtime; the route maps 422/400 before any turn work.
GGUF turns run through the real factory with a fake loader — no weights,
no network. BYOK HTTP stays stubbed at construction (shared machinery).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.chat.schemas import ChatRequest
from app.modules.companion import get_store

client = TestClient(app)

BYOK = {
    "provider": "custom_openai",
    "base_url": "https://llm.example/v1",
    "api_key": "user-key",
    "model": "user-model",
}


def test_chat_request_model_selection_is_model_id_byok_only() -> None:
    """ADR-006 vocabulary: model_id + nested byok; the five banned top-level
    names stay banned (existing guardrail test pins their absence)."""
    fields = ChatRequest.model_fields
    assert "model_id" in fields
    assert "byok" in fields
    assert set(ByokFields()) == {"provider", "base_url", "api_key", "model"}


def ByokFields() -> list[str]:
    from app.modules.chat.schemas import ByokAuth

    return list(ByokAuth.model_fields)


@pytest.mark.parametrize(
    "body",
    [
        {"message": "hi", "search": None, "byok": BYOK},
        {"message": "hi", "model_id": "m.gguf", "byok": {**BYOK, "api_key": "  "}},
        {"message": "hi", "model_id": "m.gguf", "byok": {**BYOK, "model": ""}},
        {"message": "hi", "model_id": "m.gguf", "byok": {**BYOK, "base_url": ""}},
        {"message": "hi", "model_id": "m.gguf", "byok": {**BYOK, "provider": "exa"}},
    ],
)
def test_byok_validation_rejects_garbage(body: dict) -> None:
    resp = client.post("/api/chat", json=body)
    assert resp.status_code == 422


def test_unknown_model_id_is_400_json(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,  # type: ignore[no-untyped-def]
) -> None:
    monkeypatch.setattr("app.shared.paths.MODELS_DIR", tmp_path)
    resp = client.post("/api/chat", json={"message": "hi", "model_id": "ghost.gguf"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_request"


def test_unknown_model_id_is_400_before_stream(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,  # type: ignore[no-untyped-def]
) -> None:
    monkeypatch.setattr("app.shared.paths.MODELS_DIR", tmp_path)
    resp = client.post(
        "/api/chat", json={"message": "hi", "model_id": "ghost.gguf", "stream": True}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_request"


def _use_real_factory_with_fake_llama(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,  # type: ignore[no-untyped-def]
):
    """Drop the echo override: the route resolves + builds for real."""
    from app.modules import companion

    monkeypatch.setattr("app.shared.paths.MODELS_DIR", tmp_path)
    (tmp_path / "tiny.gguf").write_bytes(b"gguf")

    class FakeLlama:
        def create_chat_completion(self, messages: object, max_tokens: int) -> dict:
            return {"choices": [{"message": {"content": "local answer"}}]}

        def close(self) -> None:
            pass

    monkeypatch.setattr("app.providers.llamacpp._loader", lambda path: FakeLlama())
    monkeypatch.delitem(app.dependency_overrides, companion.agent_dependency)


def test_gguf_turn_serves_without_tools(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,  # type: ignore[no-untyped-def]
) -> None:
    _use_real_factory_with_fake_llama(tmp_path, monkeypatch)
    resp = client.post("/api/chat", json={"message": "hi", "model_id": "tiny.gguf"})
    assert resp.status_code == 200
    assert resp.json()["reply"] == "local answer"
    turns = get_store().get(str(resp.json()["session_id"]))
    assert turns is not None
    assert turns[-1].metadata is None


def test_gguf_stream_serves_single_chunk(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,  # type: ignore[no-untyped-def]
) -> None:
    _use_real_factory_with_fake_llama(tmp_path, monkeypatch)
    resp = client.post(
        "/api/chat", json={"message": "hi", "model_id": "tiny.gguf", "stream": True}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert "local answer" in resp.text
    assert '"status":"running"' not in resp.text


def test_service_passes_provider_through(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,  # type: ignore[no-untyped-def]
) -> None:
    import asyncio

    from app.modules.companion import run_turn
    from app.providers.llamacpp import LlamaCppChatProvider

    (tmp_path / "tiny.gguf").write_bytes(b"gguf")

    class FakeLlama:
        def create_chat_completion(self, messages: object, max_tokens: int) -> dict:
            return {"choices": [{"message": {"content": "direct answer"}}]}

        def close(self) -> None:
            pass

    monkeypatch.setattr("app.providers.llamacpp._loader", lambda path: FakeLlama())
    outcome = asyncio.run(
        run_turn(
            get_store(),
            None,
            "hi",
            provider=LlamaCppChatProvider(tmp_path / "tiny.gguf"),
        )
    )
    assert outcome.reply == "direct answer"
