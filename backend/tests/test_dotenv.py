"""Stdlib .env autoload: plain `python`/`uvicorn` never reads backend/.env.

Only `uv run --env-file .env` injects it; every other launch (plain
uvicorn, IDE runners, prod) booted keyless and crashed with a bare
SDK UserError. The loader runs at factory import so the key is in
os.environ before any provider is built.
"""

import os
from pathlib import Path

import pytest

from app.providers.factory import _load_dotenv


def test_load_dotenv_sets_missing_keys(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = tmp_path / ".env"
    env.write_text(
        "# comment line\n"
        "OPENROUTER_API_KEY=test-key-from-file\n"
        'OPENROUTER_MODEL="openai/gpt-4o-mini"\n'
        "EMPTY=\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)
    _load_dotenv(env)
    assert os.environ["OPENROUTER_API_KEY"] == "test-key-from-file"
    assert os.environ["OPENROUTER_MODEL"] == "openai/gpt-4o-mini"


def test_load_dotenv_never_overrides_process_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = tmp_path / ".env"
    env.write_text("OPENROUTER_API_KEY=file-key\n", encoding="utf-8")
    monkeypatch.setenv("OPENROUTER_API_KEY", "process-key")
    _load_dotenv(env)
    assert os.environ["OPENROUTER_API_KEY"] == "process-key"


def test_load_dotenv_missing_file_is_noop(tmp_path: Path) -> None:
    _load_dotenv(tmp_path / ".env-does-not-exist")
