"""Never load real VLM weights in tests — lifespan warmup is a no-op here."""

import pytest

import app.realtime.vlm as vlm


@pytest.fixture(autouse=True)
def _no_vlm_warmup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vlm, "warmup", lambda: None)
