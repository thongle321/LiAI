import os
from collections.abc import Callable

import pytest

from app.modules.companion import (
    MAX_STORED_MESSAGES,
    ConversationStore,
    InMemoryConversationStore,
    Turn,
    get_store,
)


def run_conformance_battery(make_store: Callable[[], ConversationStore]) -> None:
    store = make_store()
    sid = store.create()
    assert store.get("no-such-session") is None
    assert store.get(sid) == []
    store.append(sid, Turn(role="user", content="hi"))
    store.append(sid, Turn(role="assistant", content="yo"))
    assert store.get(sid) == [
        Turn(role="user", content="hi"),
        Turn(role="assistant", content="yo"),
    ]
    extra = 20
    for i in range(MAX_STORED_MESSAGES + extra):
        store.append(sid, Turn(role="user", content=f"m{i}"))
    turns = store.get(sid)
    assert turns is not None and len(turns) == MAX_STORED_MESSAGES
    assert turns[0].content == f"m{extra}"


def test_in_memory_passes_conformance() -> None:
    run_conformance_battery(InMemoryConversationStore)


def _supabase_env_present() -> bool:
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SECRET_KEY"))


def _live_supabase_opted_in() -> bool:
    return os.getenv("LIVE_SUPABASE") == "1" and _supabase_env_present()


@pytest.mark.skipif(
    not _live_supabase_opted_in(),
    reason="set LIVE_SUPABASE=1 (plus SUPABASE_URL and SUPABASE_SECRET_KEY) for live Supabase tests",
)
def test_supabase_passes_conformance() -> None:
    from app.modules.companion import SupabaseConversationStore

    run_conformance_battery(SupabaseConversationStore)


def test_store_selection_defaults_to_memory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CONVERSATION_STORE", raising=False)
    assert isinstance(get_store(), InMemoryConversationStore)


def test_store_selection_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.companion import SupabaseConversationStore

    monkeypatch.setenv("CONVERSATION_STORE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "dummy")
    assert isinstance(get_store(), SupabaseConversationStore)
