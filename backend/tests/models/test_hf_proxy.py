"""HuggingFace browse proxy: forward + status mapping (token per request)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.models import internal as model_files
from app.modules.models.internal.hf import HfError, hf_files, hf_search

client = TestClient(app)


class FakeResponse:
    def __init__(self, payload: object, status: int = 200):
        self._payload = payload
        self.status_code = status

    def json(self) -> object:
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def _ok(payload: object):
    def get(url: str, **kwargs: object) -> FakeResponse:
        get.seen = {"url": url, **kwargs}  # type: ignore[attr-defined]
        return FakeResponse(payload)

    return get


def test_search_forwards_query_and_token() -> None:
    get = _ok([{"modelId": "qwen/x"}])
    assert hf_search("qwen", "tok", get=get) == [{"modelId": "qwen/x"}]  # type: ignore[arg-type]
    assert get.seen["url"] == "https://huggingface.co/api/models"  # type: ignore[attr-defined]
    assert get.seen["params"] == {
        "search": "qwen",
        "filter": "gguf",
        "limit": 20,
        "sort": "downloads",
    }  # type: ignore[attr-defined]
    assert get.seen["headers"] == {
        "Accept": "application/json",
        "Authorization": "Bearer tok",
    }  # type: ignore[attr-defined]


def test_search_without_token_sends_no_auth() -> None:
    get = _ok([])
    hf_search("qwen", None, get=get)  # type: ignore[arg-type]
    assert get.seen["headers"] == {"Accept": "application/json"}  # type: ignore[attr-defined]


def test_blank_query_never_calls() -> None:
    def fail(url: str, **kwargs: object) -> FakeResponse:
        raise AssertionError("must not call")

    assert hf_search("   ", "tok", get=fail) == []  # type: ignore[arg-type]


def test_search_status_mapping() -> None:
    def paired(status: int):
        def get(url: str, **kwargs: object) -> FakeResponse:
            return FakeResponse({"error": "x"}, status=status)

        return get

    with pytest.raises(HfError) as bad_token:
        hf_search("q", "bad", get=paired(401))  # type: ignore[arg-type]
    assert bad_token.value.status == 400
    with pytest.raises(HfError) as missing:
        hf_search("q", None, get=paired(404))  # type: ignore[arg-type]
    assert missing.value.status == 404
    with pytest.raises(HfError) as broken:
        hf_search("q", None, get=paired(500))  # type: ignore[arg-type]
    assert broken.value.status == 502


def test_search_bad_shape_and_network_are_502() -> None:
    with pytest.raises(HfError) as shape:
        hf_search("q", None, get=_ok({"nope": 1}))  # type: ignore[arg-type]
    assert shape.value.status == 502

    def down(url: str, **kwargs: object) -> FakeResponse:
        raise RuntimeError("boom")

    with pytest.raises(HfError) as net:
        hf_search("q", None, get=down)  # type: ignore[arg-type]
    assert net.value.status == 502


def test_files_url_shape() -> None:
    get = _ok([{"type": "file", "path": "m.gguf"}])
    assert hf_files("Qwen/x", "tok", get=get) == [{"type": "file", "path": "m.gguf"}]  # type: ignore[arg-type]
    assert get.seen["url"] == "https://huggingface.co/api/models/Qwen/x/tree/main"  # type: ignore[attr-defined]


def test_route_returns_verbatim_and_forwards_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict = {}

    def fake_search(query: str, token: object):
        seen.update(query=query, token=token)
        return [{"modelId": "qwen/x"}]

    monkeypatch.setattr(model_files, "hf_search", fake_search)
    resp = client.get(
        "/api/models/hf/search", params={"q": "qwen"}, headers={"X-HF-Token": "tok"}
    )
    assert resp.status_code == 200
    assert resp.json() == [{"modelId": "qwen/x"}]
    assert seen == {"query": "qwen", "token": "tok"}


def test_route_maps_hf_error_to_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(query: str, token: object):
        raise HfError("check your Hugging Face token", 400)

    monkeypatch.setattr(model_files, "hf_search", fail)
    resp = client.get("/api/models/hf/search", params={"q": "q"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_request"


def test_route_blank_q_short_circuits() -> None:
    # Real impl: blank queries return [] before any HTTP (no mock needed).
    resp = client.get("/api/models/hf/search", params={"q": "  "})
    assert resp.status_code == 200
    assert resp.json() == []
