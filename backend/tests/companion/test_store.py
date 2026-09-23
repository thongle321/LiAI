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


def _supabase_env_present() -> bool:
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SECRET_KEY"))


def _live_supabase_opted_in() -> bool:
    return os.getenv("LIVE_SUPABASE") == "1" and _supabase_env_present()


def run_session_battery(make_store: Callable[[], ConversationStore]) -> None:
    """Session metadata rules both stores must satisfy."""
    store = make_store()
    sid = store.create()
    infos = store.list_sessions()
    assert [i.id for i in infos] == [sid]
    assert infos[0].title == "" and infos[0].pinned is False

    store.set_title_if_empty(sid, "first question")
    store.set_title_if_empty(sid, "second question")
    assert store.list_sessions()[0].title == "first question"

    assert store.rename_session("nope", "x") is False
    assert store.rename_session(sid, "Renamed") is True
    assert store.list_sessions()[0].title == "Renamed"

    other = store.create()
    assert store.set_session_pinned("nope", True) is False
    assert store.set_session_pinned(other, True) is True
    assert [i.id for i in store.list_sessions()] == [other, sid]
    assert store.set_session_pinned(other, False) is True

    store.append(sid, Turn(role="user", content="u1"))
    store.append(sid, Turn(role="assistant", content="a1"))
    assert store.pop_last_assistant(sid) is True
    assert store.get(sid) == [Turn(role="user", content="u1")]
    assert store.pop_last_assistant(sid) is False
    assert store.pop_last_assistant("nope") is False

    assert store.delete_session("nope") is False
    assert store.delete_session(sid) is True
    assert store.get(sid) is None
    assert [i.id for i in store.list_sessions()] == [other]


def test_in_memory_passes_session_battery() -> None:
    run_session_battery(InMemoryConversationStore)


@pytest.mark.skipif(
    not _live_supabase_opted_in(),
    reason="set LIVE_SUPABASE=1 (plus SUPABASE_URL and SUPABASE_SECRET_KEY) for live Supabase tests",
)
def test_supabase_passes_session_battery() -> None:
    from app.modules.companion import SupabaseConversationStore

    run_session_battery(SupabaseConversationStore)


def test_in_memory_passes_conformance() -> None:
    run_conformance_battery(InMemoryConversationStore)


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
