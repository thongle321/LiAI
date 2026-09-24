"""Search providers: Tavily + Brave response mapping (HTTP stubbed)."""

import pytest

from app.modules.search.providers.base import ProviderError
from app.modules.search.providers.brave import brave_search
from app.modules.search.providers.tavily import tavily_search


class FakeResponse:
    def __init__(self, payload: object, status: int = 200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> object:
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def test_tavily_maps_results() -> None:
    def post(url: str, **kwargs: object) -> FakeResponse:
        assert url == "https://api.tavily.com/search"
        assert kwargs["json"] == {
            "api_key": "k",
            "query": "q",
            "max_results": 3,
            "search_depth": "basic",
        }
        return FakeResponse(
            {
                "results": [
                    {"title": "T", "url": "https://t.example", "content": "snippet"},
                    {"url": "https://u.example"},
                ]
            }
        )

    results = tavily_search("q", "k", 3, post=post)  # type: ignore[arg-type]
    assert [(r.title, r.url, r.snippet) for r in results] == [
        ("T", "https://t.example", "snippet"),
        ("https://u.example", "https://u.example", ""),
    ]


def test_tavily_http_failure_is_provider_error() -> None:
    def post(url: str, **kwargs: object) -> FakeResponse:
        return FakeResponse({"error": "bad key"}, status=401)

    with pytest.raises(ProviderError):
        tavily_search("q", "bad", 3, post=post)  # type: ignore[arg-type]


def test_brave_maps_results() -> None:
    seen: dict[str, object] = {}

    def get(url: str, **kwargs: object) -> FakeResponse:
        seen["url"] = url
        seen["headers"] = kwargs["headers"]
        seen["params"] = kwargs["params"]
        return FakeResponse(
            {
                "web": {
                    "results": [
                        {
                            "title": "B",
                            "url": "https://b.example",
                            "description": "desc",
                        }
                    ]
                }
            }
        )

    results = brave_search("q", "k", 2, get=get)  # type: ignore[arg-type]
    assert seen["url"] == "https://api.search.brave.com/res/v1/web/search"
    assert seen["headers"] == {"X-Subscription-Token": "k"}
    assert seen["params"] == {"q": "q", "count": 2}
    assert [(r.title, r.url, r.snippet) for r in results] == [
        ("B", "https://b.example", "desc")
    ]


def test_brave_bad_json_is_provider_error() -> None:
    def get(url: str, **kwargs: object) -> FakeResponse:
        return FakeResponse(ValueError("nope"))

    with pytest.raises(ProviderError):
        brave_search("q", "k", 2, get=get)  # type: ignore[arg-type]
