"""Web-search module: one seam over Tavily/Brave (ADR-007).

`search_web(provider, key, query, count)` is the only public entry —
companion talents delegate here, never to providers directly. Keys are
BYOK per ADR-004: transient per call, never persisted, never cached
(the cache key is provider + query + count only).
"""

from .budget import SEARCH_BUDGET_CHARS, TTLCache, clip_results
from .providers import ProviderError, SearchResult, brave_search, tavily_search

MIN_COUNT = 1
MAX_COUNT = 10

_cache = TTLCache()


def search_web(
    provider: str, key: str, query: str, count: int = 5
) -> list[SearchResult]:
    """Dispatch, budget-clip, and share cached results across keys."""
    if provider not in ("tavily", "brave"):
        raise ProviderError(f"unknown search provider: {provider}")
    if not key.strip():
        raise ProviderError("search key is required")
    if not query.strip():
        return []
    clamped = max(MIN_COUNT, min(MAX_COUNT, count))
    cache_key = (provider, query.strip(), clamped)
    hit = _cache.get(cache_key)
    if isinstance(hit, list):
        return hit
    if provider == "tavily":
        results = tavily_search(query.strip(), key, clamped)
    else:
        results = brave_search(query.strip(), key, clamped)
    clipped = clip_results(results, SEARCH_BUDGET_CHARS)
    _cache.set(cache_key, clipped)
    return clipped


__all__ = ["ProviderError", "SearchResult", "search_web"]
