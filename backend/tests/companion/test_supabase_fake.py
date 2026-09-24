"""Durable store seam: injectable client = second adapter, keyless CI.

SupabaseConversationStore re-read the module singleton per method, so the
conformance battery's Supabase leg could only run live. A fake client
adapter at the same chain interface proves order/limit/metadata rules
offline — one adapter hypothetical seam, two = real.
"""

from typing import Any

import pytest
from test_store import run_conformance_battery, run_session_battery

from app.modules.companion import (
    MAX_STORED_MESSAGES,
    InMemoryConversationStore,
    SupabaseConversationStore,
    Turn,
)


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    """PostgREST chain used by SupabaseConversationStore: fake, dict-backed."""

    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables
        self._table = ""
        self._op = ""
        self._payload: dict[str, Any] = {}
        self._filters: list[tuple[str, Any]] = []
        self._orders: list[tuple[str, bool]] = []
        self._limit: int | None = None
        self._select = ""

    def from_(self, table: str) -> "_Query":
        self._table = table
        return self

    def select(self, columns: str) -> "_Query":
        self._op = "select"
        self._select = columns
        return self

    def insert(self, row: dict[str, Any]) -> "_Query":
        self._op = "insert"
        self._payload = row
        return self

    def update(self, row: dict[str, Any]) -> "_Query":
        self._op = "update"
        self._payload = row
        return self

    def delete(self) -> "_Query":
        self._op = "delete"
        return self

    def upsert(self, row: dict[str, Any]) -> "_Query":
        self._op = "upsert"
        self._payload = row
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self._filters.append((column, value))
        return self

    def order(self, column: str, *, desc: bool = False) -> "_Query":
        self._orders.append((column, desc))
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def execute(self) -> _Result:
        rows = self._tables.setdefault(self._table, [])
        if self._op == "insert":
            row = dict(self._payload)
            if "id" not in row:
                row["id"] = len(rows) + 1  # DB-like autoincrement for order()
            if "created_at" not in row:
                row["created_at"] = row["id"]
            if self._table == "sessions":
                # Mirror the DB defaults from the sessions migrations.
                row.setdefault("title", "")
                row.setdefault("pinned", False)
                row.setdefault("updated_at", f"t{len(rows):06d}")
            rows.append(row)
            return _Result([row])
        if self._op == "update":
            matched = [r for r in rows if all(r.get(c) == v for c, v in self._filters)]
            for row in matched:
                row.update(self._payload)
            return _Result([dict(r) for r in matched])
        if self._op == "delete":
            kept = [r for r in rows if not all(r.get(c) == v for c, v in self._filters)]
            removed = [r for r in rows if r not in kept]
            self._tables[self._table] = kept
            return _Result([dict(r) for r in removed])
        if self._op == "upsert":
            key = self._payload.get("id")
            for i, row in enumerate(rows):
                if row.get("id") == key:
                    rows[i] = dict(self._payload)
                    return _Result([dict(self._payload)])
            rows.append(dict(self._payload))
            return _Result([dict(self._payload)])
        selected = [dict(r) for r in rows]
        for column, value in self._filters:
            selected = [r for r in selected if r.get(column) == value]
        # Only created_at desc + id desc used by the store; honor both.
        for column, desc in reversed(self._orders):
            selected.sort(
                key=lambda r, c=column: (r.get(c) is None, r.get(c)), reverse=desc
            )
        if self._limit is not None:
            selected = selected[: self._limit]
        return _Result(selected)


class FakeSupabaseClient:
    def __init__(self) -> None:
        self._tables: dict[str, list[dict[str, Any]]] = {}

    def from_(self, table: str) -> _Query:
        # Fresh chain per call, sharing storage (matches SDK usage).
        return _Query(self._tables).from_(table)


def test_supabase_fake_passes_conformance() -> None:
    client = FakeSupabaseClient()
    run_conformance_battery(lambda: SupabaseConversationStore(client=client))


def test_supabase_fake_passes_session_battery() -> None:
    client = FakeSupabaseClient()
    run_session_battery(lambda: SupabaseConversationStore(client=client))


def test_injected_client_skips_singleton(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def boom() -> Any:
        raise AssertionError("get_client must not be called when client is injected")

    monkeypatch.setattr("app.modules.companion.supabase_store.get_client", boom)
    store = SupabaseConversationStore(client=FakeSupabaseClient())
    sid = store.create()
    store.append(sid, Turn(role="user", content="hi"))
    assert store.get(sid) == [Turn(role="user", content="hi")]


def test_missing_session_returns_none_on_fake() -> None:
    store = SupabaseConversationStore(client=FakeSupabaseClient())
    assert store.get("nope") is None


def test_default_init_still_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_creds() -> Any:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")

    monkeypatch.setattr("app.modules.companion.supabase_store.get_client", no_creds)
    with pytest.raises(RuntimeError, match="SUPABASE"):
        SupabaseConversationStore()


def test_memory_store_untouched_by_fake_battery() -> None:
    # Conformance helper itself stays adapter-agnostic.
    run_conformance_battery(InMemoryConversationStore)
    assert MAX_STORED_MESSAGES == 100
