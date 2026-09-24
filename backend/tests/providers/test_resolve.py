"""resolve(model_id, byok): per-request provider selection (ADR-006)."""

from pathlib import Path

import pytest

from app.providers.custom import CustomChatProvider
from app.providers.factory import ByokContext, UnknownModelError, resolve
from app.providers.llamacpp import LlamaCppChatProvider
from app.providers.openrouter import OpenRouterChatProvider


def _byok(provider: str = "custom_openai") -> ByokContext:
    return ByokContext(
        provider=provider,
        base_url="https://llm.example/v1",
        api_key="user-key",
        model="user-model",
    )


def test_none_selects_default_provider() -> None:
    assert isinstance(resolve(None, None), OpenRouterChatProvider)


def test_gguf_filename_selects_llamacpp(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "a.gguf").write_bytes(b"gguf")
    monkeypatch.setattr("app.shared.paths.MODELS_DIR", tmp_path)
    provider = resolve("a.gguf", None)
    assert isinstance(provider, LlamaCppChatProvider)
    assert provider._model_path == tmp_path / "a.gguf"


def test_gguf_wins_over_byok(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "a.gguf").write_bytes(b"gguf")
    monkeypatch.setattr("app.shared.paths.MODELS_DIR", tmp_path)
    assert isinstance(resolve("a.gguf", _byok()), LlamaCppChatProvider)


def test_traversal_and_non_gguf_are_unknown(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    models = tmp_path / "models"
    models.mkdir()
    (models / "inside.gguf").write_bytes(b"gguf")
    (tmp_path / "outside.gguf").write_bytes(b"gguf")
    (models / "a.bin").write_bytes(b"bin")
    monkeypatch.setattr("app.shared.paths.MODELS_DIR", models)
    # "../outside.gguf" collapses to a name missing inside the dir:
    # the escape is neutralized, never followed.
    with pytest.raises(UnknownModelError):
        resolve("../outside.gguf", None)
    with pytest.raises(UnknownModelError):
        resolve("a.bin", None)
    with pytest.raises(UnknownModelError):
        resolve("ghost.gguf", None)


def test_byok_custom_selects_custom_provider() -> None:
    provider = resolve("remote-1", _byok("custom_openai"))
    assert isinstance(provider, CustomChatProvider)
    assert provider.model_name == "user-model"


def test_byok_openrouter_selects_native_integration() -> None:
    provider = resolve("remote-1", _byok("openrouter"))
    assert isinstance(provider, OpenRouterChatProvider)
    assert provider.model_name == "user-model"


def test_unknown_id_without_byok_is_unknown() -> None:
    with pytest.raises(UnknownModelError):
        resolve("remote-1", None)
