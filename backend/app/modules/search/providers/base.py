"""Search provider shared shape: result rows, errors, response mapping."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str


class ProviderError(Exception):
    """Provider call failed (network, status, or shape); routes map it."""


def response_json(response: Any) -> Any:
    """Raise ProviderError on HTTP failures and unparseable bodies."""
    try:
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        raise ProviderError(f"search provider call failed: {exc}") from exc


def row_text(row: Mapping[str, Any], *keys: str) -> str:
    """First non-empty string under any of the keys (providers rename fields)."""
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


HttpPost = Callable[..., Any]
"""httpx.post-shaped seam (tests inject fakes)."""
