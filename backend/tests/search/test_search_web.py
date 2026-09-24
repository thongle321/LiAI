"""search_web seam: dispatch, count clamp, shared cache (providers stubbed)."""

import pytest

from app.modules.search import ProviderError, SearchResult, search_web


def _fake_results(tag: str) -> list[SearchResult]:
    return [SearchResult(title=tag, url="https://example.com", snippet="s")]


def test_unknown_provider_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ProviderError, match="unknown search provider"):
        search_web("exa", "k", "q", 3)


def test_blank_query_returns_empty_without_calling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(query: str, key: str, count: int, **kwargs: object) -> list[SearchResult]:
        raise AssertionError("provider must not be called")

    monkeypatch.setattr("app.modules.search.tavily_search", fail)
    assert search_web("tavily", "k", "   ", 3) == []


def test_blank_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ProviderError, match="search key is required"):
        search_web("tavily", "  ", "q", 3)


def test_dispatch_and_count_clamp(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def fake_tavily(
        query: str, key: str, count: int, **kwargs: object
    ) -> list[SearchResult]:
        seen.update(query=query, key=key, count=count)
        return _fake_results("t")

    monkeypatch.setattr("app.modules.search.tavily_search", fake_tavily)
    assert search_web("tavily", "k", "q", 99)[0].title == "t"
    assert seen == {"query": "q", "key": "k", "count": 10}


def test_second_call_serves_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    def fake_brave(
        query: str, key: str, count: int, **kwargs: object
    ) -> list[SearchResult]:
        calls["n"] += 1
        return _fake_results("b")

    monkeypatch.setattr("app.modules.search.brave_search", fake_brave)
    # Different keys, same query: the key is transient, never cached.
    assert search_web("brave", "k1", "cache me", 2)[0].title == "b"
    assert search_web("brave", "k2", "cache me", 2)[0].title == "b"
    assert calls["n"] == 1


def test_results_are_budget_clipped(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_tavily(
        query: str, key: str, count: int, **kwargs: object
    ) -> list[SearchResult]:
        return [SearchResult(title="t", url="https://example.com", snippet="x" * 99999)]

    monkeypatch.setattr("app.modules.search.tavily_search", fake_tavily)
    (clipped,) = search_web("tavily", "k", "clip me", 1)
    assert len(clipped.snippet) <= 4000
