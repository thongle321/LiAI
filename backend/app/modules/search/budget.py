"""Search result budgeting: snippet clipping + expiry cache (pure)."""

from collections.abc import Callable
from time import monotonic

from .providers.base import SearchResult

SEARCH_BUDGET_CHARS = 4000
"""Total snippet budget per search: results past it are dropped, never fetched more."""


def clip_results(
    results: list[SearchResult], budget: int = SEARCH_BUDGET_CHARS
) -> list[SearchResult]:
    """Fit snippets into the budget in order: trim the straddler, drop the rest.

    Returns new rows (inputs are never mutated — cached rows stay intact).
    """
    clipped: list[SearchResult] = []
    remaining = budget
    for result in results:
        if remaining <= 0:
            break
        snippet = result.snippet[:remaining]
        remaining -= len(snippet)
        clipped.append(
            SearchResult(title=result.title, url=result.url, snippet=snippet)
        )
    return clipped


class TTLCache:
    """Tiny key→value cache with expiry and oldest-evict.

    Single-threaded use only: the app serves search from the event loop
    and tests drive it directly, so no locks (a global lock would be a
    `ponytail:` ceiling if this ever leaves the loop).
    """

    def __init__(
        self,
        maxsize: int = 128,
        ttl_seconds: float = 300,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._maxsize = maxsize
        self._ttl = ttl_seconds
        self._clock = clock
        self._rows: dict[object, tuple[float, object]] = {}

    def get(self, key: object) -> object | None:
        row = self._rows.get(key)
        if row is None:
            return None
        expires_at, value = row
        if self._clock() >= expires_at:
            del self._rows[key]
            return None
        return value

    def set(self, key: object, value: object) -> None:
        if key in self._rows:
            del self._rows[key]
        while len(self._rows) >= self._maxsize:
            oldest = next(iter(self._rows))
            del self._rows[oldest]
        self._rows[key] = (self._clock() + self._ttl, value)
