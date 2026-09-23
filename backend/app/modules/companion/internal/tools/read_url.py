"""read_url talent: fetch a page, extract its main text (trafilatura).

SSRF guard (allowlist shape): only public http(s) targets — literal
private/loopback IPs and localhost names are rejected, and hostnames are
resolved with every answer required to be a public IP (DNS-rebinding
cover). Every outcome is a string, never a raise.
"""

import ipaddress
import socket
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

import httpx
import trafilatura

from .untrusted import mark_untrusted

FETCH_TIMEOUT_S = 15.0
MAX_BYTES = 2_000_000
"""Fetch cap: larger bodies are refused before parsing (context-budget guard)."""

READ_MAX_CHARS = 6000
"""Extracted-text cap: the model gets the head, told it was truncated."""

_ALLOWED_SCHEMES = {"http", "https"}
_LOCAL_NAMES = {"localhost"}

HttpGet = Callable[..., Any]
"""httpx.get-shaped seam (tests inject fakes)."""

Resolver = Callable[[str, int], list[Any]]
"""socket.getaddrinfo-shaped seam (tests inject fakes)."""


def _ip_blocked(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not addr.is_global


def _host_allowed(host: str, resolve: Resolver) -> bool:
    if not host or host.lower() in _LOCAL_NAMES:
        return False
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        addr = None
    if addr is not None:
        return not _ip_blocked(str(addr))
    try:
        answers = resolve(host, 443)
    except OSError:
        return False
    if not answers:
        return False
    for answer in answers:
        try:
            sock_addr = answer[4][0]
        except (IndexError, TypeError):
            return False
        if not isinstance(sock_addr, str) or _ip_blocked(sock_addr):
            return False
    return True


def read_url(
    url: str,
    get: HttpGet = httpx.get,
    resolve: Resolver = socket.getaddrinfo,
) -> str:
    """Fetch the page and return its main text, fenced as untrusted data."""
    target = url.strip()
    scheme = urlparse(target).scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        return f"cannot read {target!r}: only public http(s) pages are allowed."
    host = urlparse(target).hostname or ""
    if not _host_allowed(host, resolve):
        return f"cannot read {target!r}: host is not allowed."
    try:
        response = get(
            target,
            timeout=FETCH_TIMEOUT_S,
            headers={"User-Agent": "LiAI/1.0"},
        )
        response.raise_for_status()
        body = response.content
        if len(body) > MAX_BYTES:
            return f"cannot read {target!r}: page is too large."
        text = trafilatura.extract(response.text) or ""
    except Exception:  # noqa: BLE001 — tool boundary: any fetch/parse failure becomes a string, tools never raise
        return f"cannot read {target!r}: fetch failed."
    text = text.strip()
    if not text:
        return f"cannot read {target!r}: no readable text found."
    if len(text) > READ_MAX_CHARS:
        text = text[:READ_MAX_CHARS] + "\n…[truncated]"
    return mark_untrusted(f"read_url {target}", text)
