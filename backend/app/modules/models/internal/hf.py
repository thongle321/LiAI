"""HuggingFace browse proxy (ADR-004/006): forward + status mapping.

The backend forwards the browse call with the per-request token and
returns HF's JSON verbatim — no shaping, no storing, no logging of the
token (it arrives in a header, never the URL, so access logs stay clean).
Pure forwarding keeps the client parsers unchanged; only the endpoint
and the auth header move server-side.
"""

from collections.abc import Callable
from typing import Any

import httpx

HF_API = "https://huggingface.co/api"
TIMEOUT_S = 15.0

HttpGet = Callable[..., Any]
"""httpx.get-shaped seam (tests inject fakes)."""


class HfError(Exception):
    """HF call failed; status is the route's HTTP status (not HF's)."""

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def _headers(token: str | None) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def require_row_list(payload: object, what: str) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise HfError(f"huggingface returned an unexpected {what} shape")
    rows: list[dict[str, Any]] = []
    for row in payload:
        if isinstance(row, dict):
            rows.append(row)
    return rows


def forward_to_hf(
    url: str, params: dict[str, object], token: str | None, get: HttpGet
) -> Any:
    try:
        response = get(url, params=params, headers=_headers(token), timeout=TIMEOUT_S)
    except Exception as exc:
        raise HfError(f"huggingface request failed: {exc}") from exc
    if response.status_code == 200:
        try:
            return response.json()
        except Exception as exc:
            raise HfError(f"huggingface returned bad JSON: {exc}") from exc
    if response.status_code in (401, 403):
        raise HfError("check your Hugging Face token", 400)
    if response.status_code == 404:
        raise HfError("huggingface model not found", 404)
    raise HfError(f"huggingface errored with status {response.status_code}")


def hf_search(
    query: str, token: str | None, get: HttpGet = httpx.get
) -> list[dict[str, Any]]:
    """Search GGUF models; blank queries return [] without calling."""
    if not query.strip():
        return []
    payload = forward_to_hf(
        f"{HF_API}/models",
        {"search": query.strip(), "filter": "gguf", "limit": 20, "sort": "downloads"},
        token,
        get,
    )
    return require_row_list(payload, "search")


def hf_files(
    repo: str, token: str | None, get: HttpGet = httpx.get
) -> list[dict[str, Any]]:
    """List a repo's tree; blank repos return [] without calling."""
    if not repo.strip():
        return []
    payload = forward_to_hf(f"{HF_API}/models/{repo.strip()}/tree/main", {}, token, get)
    return require_row_list(payload, "tree")
