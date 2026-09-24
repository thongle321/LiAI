"""LlamaCpp provider: lazy one-slot GGUF chat (weights never load in tests)."""

import asyncio
from pathlib import Path
from typing import ClassVar

import pytest

from app.providers.llamacpp import LlamaCppChatProvider


class FakeLlama:
    instances: ClassVar[list["FakeLlama"]] = []

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.closed = False
        FakeLlama.instances.append(self)

    def create_chat_completion(self, messages: object, max_tokens: int) -> object:
        self.calls.append(str(messages))
        return {"choices": [{"message": {"content": "  local hi  "}}]}

    def close(self) -> None:
        self.closed = True


@pytest.fixture(autouse=True)
def _clean_instances():
    FakeLlama.instances.clear()
    yield
    FakeLlama.instances.clear()


def _provider(monkeypatch: pytest.MonkeyPatch, name: str = "a.gguf"):
    def fake_loader(path: Path):
        return FakeLlama()

    monkeypatch.setattr("app.providers.llamacpp._loader", fake_loader)
    return LlamaCppChatProvider(Path("/models") / name)


def test_reply_returns_stripped_text(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    path = tmp_path / "a.gguf"
    path.write_bytes(b"gguf")
    provider = _provider(monkeypatch)
    provider._model_path = path
    assert asyncio.run(provider.reply("hi")) == "local hi"


def test_loader_called_once_per_slot(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    path = tmp_path / "a.gguf"
    path.write_bytes(b"gguf")
    provider = _provider(monkeypatch)
    provider._model_path = path
    asyncio.run(provider.reply("hi"))
    asyncio.run(provider.reply("hi"))
    assert len(FakeLlama.instances) == 1


def test_switching_models_releases_previous(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "a.gguf").write_bytes(b"gguf")
    (tmp_path / "b.gguf").write_bytes(b"gguf")
    provider = _provider(monkeypatch)
    provider._model_path = tmp_path / "a.gguf"
    asyncio.run(provider.reply("hi"))
    first = FakeLlama.instances[0]
    provider._model_path = tmp_path / "b.gguf"
    asyncio.run(provider.reply("hi"))
    assert first.closed is True
    assert len(FakeLlama.instances) == 2


def test_non_mapping_response_is_type_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    class ListLlama(FakeLlama):
        def create_chat_completion(self, messages: object, max_tokens: int):
            return ["not", "a", "mapping"]

    (tmp_path / "a.gguf").write_bytes(b"gguf")
    monkeypatch.setattr("app.providers.llamacpp._loader", lambda path: ListLlama())
    provider = LlamaCppChatProvider(tmp_path / "a.gguf")
    with pytest.raises(TypeError):
        asyncio.run(provider.reply("hi"))


def test_missing_file_never_loads(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    provider = _provider(monkeypatch)
    provider._model_path = tmp_path / "ghost.gguf"
    with pytest.raises(FileNotFoundError):
        asyncio.run(provider.reply("hi"))
    assert FakeLlama.instances == []


def test_plain_chat_has_no_tool_model(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _provider(monkeypatch).create_tool_model() is None


def test_model_name_is_filename(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _provider(monkeypatch, "b.gguf").model_name == "b.gguf"
