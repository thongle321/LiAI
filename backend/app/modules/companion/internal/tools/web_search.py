"""Web-search talent: thin delegate to the search module (ADR-007)."""

from dataclasses import dataclass

from app.modules.search import ProviderError, search_web

from .untrusted import mark_untrusted


@dataclass(frozen=True)
class SearchContext:
    """Per-request search credentials (BYOK, ADR-004).

    Transient: carried from the chat body to the tool call, never
    persisted, never logged, never cached (the result cache keys on
    provider + query + count only).
    """

    provider: str
    key: str
    count: int


def run_web_search(query: str, search: SearchContext | None) -> str:
    """Search the web; every outcome is a string, never a raise.

    Tools must not raise (a raise becomes framework error machinery);
    the model reads the string and either cites it or moves on.
    """
    if search is None:
        return (
            "web search is unavailable: no search key was provided with this request."
        )
    if not query.strip():
        return "cannot search: query is empty"
    try:
        results = search_web(search.provider, search.key, query.strip(), search.count)
    except ProviderError as exc:
        return f"web search failed: {exc}"
    if not results:
        return f"web search for {query.strip()!r} returned no results."
    lines = [
        f"{i}. {result.title} — {result.url}\n{result.snippet}"
        for i, result in enumerate(results, start=1)
    ]
    return mark_untrusted(f"web_search {search.provider}", "\n\n".join(lines))
