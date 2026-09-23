"""Custom BYOK provider: construction, key checks, shared request path."""

import asyncio

import pytest
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models import ModelRequestParameters

from app.providers.custom import CustomChatProvider


def _provider(**overrides: str) -> CustomChatProvider:
    args = {"base_url": "https://llm.example/v1", "api_key": "k", "model": "m"}
    args.update(overrides)
    return CustomChatProvider(**args)


def test_construction_is_offline() -> None:
    from pydantic_ai.providers.openai import OpenAIProvider

    provider = _provider()
    assert isinstance(provider._provider(), OpenAIProvider)
    assert provider.model_name == "m"


def test_prepare_rejects_blank_key() -> None:
    with pytest.raises(RuntimeError):
        _provider(api_key="")._prepare()


def test_reply_uses_three_arg_request(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = _provider()
    model = provider._get_model()
    seen: dict = {}

    async def fake_request(messages, model_settings, model_request_parameters):
        seen["args"] = (messages, model_settings, model_request_parameters)
        return ModelResponse(parts=[TextPart("hi")])

    monkeypatch.setattr(model, "request", fake_request)
    assert asyncio.run(provider.reply("hi")) == "hi"
    _messages, settings, params = seen["args"]
    assert settings is None
    assert isinstance(params, ModelRequestParameters)


def test_reply_empty_choices_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = _provider()
    model = provider._get_model()

    async def fake_request(messages, model_settings, model_request_parameters):
        return ModelResponse(parts=[])

    monkeypatch.setattr(model, "request", fake_request)
    with pytest.raises(RuntimeError, match="no text"):
        asyncio.run(provider.reply("hi"))
