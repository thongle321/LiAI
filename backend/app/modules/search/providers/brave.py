"""Brave search provider (BYOK key per call, never stored)."""

import httpx

from .base import HttpPost, ProviderError, SearchResult, response_json, row_text

SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
TIMEOUT_S = 15.0


def brave_search(
    query: str, key: str, count: int, get: HttpPost = httpx.get
) -> list[SearchResult]:
    """GET web search; rows map title/url/description, tolerant of missing fields."""
    try:
        payload = response_json(
            get(
                SEARCH_URL,
                headers={"X-Subscription-Token": key},
                params={"q": query, "count": count},
                timeout=TIMEOUT_S,
            )
        )
    except ProviderError:
        raise
    except Exception as exc:
        raise ProviderError(f"brave request failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise ProviderError("brave returned an unexpected shape")
    web = payload.get("web")
    rows = web.get("results") if isinstance(web, dict) else None
    if not isinstance(rows, list):
        raise ProviderError("brave returned an unexpected shape")
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
                snippet=row_text(row, "description"),
            )
        )
    return results
