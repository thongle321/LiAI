"""Tavily search provider (BYOK key per call, never stored)."""

import httpx

from .base import HttpPost, ProviderError, SearchResult, response_json, row_text

SEARCH_URL = "https://api.tavily.com/search"
TIMEOUT_S = 15.0


def tavily_search(
    query: str, key: str, count: int, post: HttpPost = httpx.post
) -> list[SearchResult]:
    """POST /search; rows map title/url/content, tolerant of missing fields."""
    try:
        payload = response_json(
            post(
                SEARCH_URL,
                json={
                    "api_key": key,
                    "query": query,
                    "max_results": count,
                    "search_depth": "basic",
                },
                timeout=TIMEOUT_S,
            )
        )
    except ProviderError:
        raise
    except Exception as exc:
        raise ProviderError(f"tavily request failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise ProviderError("tavily returned an unexpected shape")
    rows = payload.get("results")
    if not isinstance(rows, list):
        raise ProviderError("tavily returned an unexpected shape")
    results: list[SearchResult] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        url = row_text(row, "url")
        if not url:
            continue
        results.append(
            SearchResult(
                title=row_text(row, "title") or url,
                url=url,
                snippet=row_text(row, "content"),
            )
        )
    return results
