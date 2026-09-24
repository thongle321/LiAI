"""Search budget: snippet clipping + TTL cache (pure)."""

from app.modules.search.budget import SEARCH_BUDGET_CHARS, TTLCache, clip_results
from app.modules.search.providers.base import SearchResult


def _res(snippet: str, title: str = "t") -> SearchResult:
    return SearchResult(title=title, url="https://example.com", snippet=snippet)


def test_clip_keeps_short_results_whole() -> None:
    results = [_res("a" * 100), _res("b" * 100)]
    assert clip_results(results) == results


def test_clip_trims_to_budget_in_order() -> None:
    results = [_res("a" * (SEARCH_BUDGET_CHARS - 10)), _res("b" * 100)]
    clipped = clip_results(results)
    assert len(clipped) == 2
    assert len(clipped[0].snippet) == SEARCH_BUDGET_CHARS - 10
    assert len(clipped[1].snippet) == 10
    total = sum(len(r.snippet) for r in clipped)
    assert total == SEARCH_BUDGET_CHARS


def test_clip_drops_results_past_the_budget() -> None:
    results = [_res("a" * SEARCH_BUDGET_CHARS), _res("b" * 10)]
    clipped = clip_results(results)
    assert [r.snippet for r in clipped] == ["a" * SEARCH_BUDGET_CHARS]


def test_clip_does_not_mutate_inputs() -> None:
    results = [_res("a" * SEARCH_BUDGET_CHARS), _res("b" * 100)]
    clip_results(results)
    assert results[1].snippet == "b" * 100


def test_cache_hit_and_miss() -> None:
    cache = TTLCache(maxsize=2, ttl_seconds=60)
    assert cache.get("k") is None
    cache.set("k", [1])
    assert cache.get("k") == [1]


def test_cache_expiry() -> None:
    now = [1000.0]
    cache = TTLCache(maxsize=2, ttl_seconds=60, clock=lambda: now[0])
    cache.set("k", [1])
    now[0] += 61.0
    assert cache.get("k") is None


def test_cache_evicts_oldest_past_maxsize() -> None:
    cache = TTLCache(maxsize=2, ttl_seconds=60)
    cache.set("a", [1])
    cache.set("b", [2])
    cache.set("c", [3])
    assert cache.get("a") is None
    assert cache.get("b") == [2]
    assert cache.get("c") == [3]
