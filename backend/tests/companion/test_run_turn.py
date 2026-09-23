"""Turn lifecycle seam: run_turn owns load/mint → reply → persist.

Routes (HTTP chat, frame Q&A) delegate; the persist/no-history choice
is one visible argument at the call site.
"""

import asyncio

import pytest
from conftest import make_broken_agent, make_echo_agent

from app.modules.companion import (
    InMemoryConversationStore,
    SessionInfo,
    StoreError,
    Turn,
    run_turn,
)


class _RefusingStore:
    """ConversationStore shape with refusing defaults.

    Purpose-built doubles subclass this and override only the operations
    their path exercises; any other call fails loudly at the call site
    instead of AttributeError-ing deep in the seam.
    """

    def create(self) -> str:
        raise AssertionError("store.create not exercised on this path")

    def get(self, session_id: str) -> list[Turn] | None:
        raise AssertionError("store.get not exercised on this path")

    def append(self, session_id: str, turn: Turn) -> None:
        raise AssertionError("store.append not exercised on this path")

    def list_sessions(self) -> list[SessionInfo]:
        raise AssertionError("store.list_sessions not exercised on this path")

    def rename_session(self, session_id: str, title: str) -> bool:
        raise AssertionError("store.rename_session not exercised on this path")

    def set_session_pinned(self, session_id: str, pinned: bool) -> bool:
        raise AssertionError("store.set_session_pinned not exercised on this path")

    def delete_session(self, session_id: str) -> bool:
        raise AssertionError("store.delete_session not exercised on this path")

    def set_title_if_empty(self, session_id: str, title: str) -> None:
        raise AssertionError("store.set_title_if_empty not exercised on this path")

    def pop_last_assistant(self, session_id: str) -> bool:
        raise AssertionError("store.pop_last_assistant not exercised on this path")


def test_text_turn_mints_session_and_persists() -> None:
    store = InMemoryConversationStore()
    out = asyncio.run(run_turn(store, None, "hi", agent=make_echo_agent()))
    assert out.reply == "Echo: hi"
    assert out.session_id
    turns = store.get(out.session_id)
    assert turns is not None and len(turns) == 2
    assert turns[0] == Turn(role="user", content="hi")
    assert turns[1].role == "assistant"


def test_existing_session_reuses_and_extends_history() -> None:
    store = InMemoryConversationStore()
    sid = store.create()
    store.append(sid, Turn(role="user", content="old"))
    store.append(sid, Turn(role="assistant", content="old-a"))
    out = asyncio.run(run_turn(store, sid, "hi", agent=make_echo_agent()))
    assert out.session_id == sid
    turns = store.get(sid)
    assert turns is not None and len(turns) == 4


def test_use_history_false_never_reads_store() -> None:
    appended: list[Turn] = []

    class SpyStore:
        def __init__(self) -> None:
            self.gets = 0
            self.titles: list[tuple[str, str]] = []

        def get(self, session_id: str) -> list[Turn] | None:
            self.gets += 1
            return None

        def create(self) -> str:
            raise AssertionError("mint must not happen when session_id given")

        def append(self, session_id: str, turn: Turn) -> None:
            assert session_id == "s1"
            appended.append(turn)

        def set_title_if_empty(self, session_id: str, title: str) -> None:
            self.titles.append((session_id, title))

    spy = SpyStore()
    out = asyncio.run(
        run_turn(
            spy,
            "s1",
            "what?",
            prompt="composed prompt",
            use_history=False,
            agent=make_echo_agent(),
        )
    )
    assert spy.gets == 0
    assert out.session_id == "s1"
    assert appended[0].content == "what?"  # user text, not the composed prompt
    assert spy.titles == [("s1", "what?")]  # title derives from user text too


def test_store_failure_raises_store_error() -> None:
    class Broken:
        def get(self, session_id: str) -> list[Turn] | None:
            raise RuntimeError("db down")

        def create(self) -> str:
            raise RuntimeError("db down")

        def append(self, session_id: str, turn: Turn) -> None:
            raise RuntimeError("db down")

    with pytest.raises(StoreError, match="db down"):
        asyncio.run(run_turn(Broken(), None, "hi"))


def test_llm_failure_bubbles_not_store_error() -> None:
    store = InMemoryConversationStore()
    with pytest.raises(Exception) as excinfo:
        asyncio.run(run_turn(store, None, "hi", agent=make_broken_agent()))
    assert not isinstance(excinfo.value, StoreError)
    assert "db down" not in str(excinfo.value)


def test_image_turn_replies_through_vlm(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.shared import vlm

    async def fake_describe(image: bytes, question: str) -> str:
        assert image == b"\xff\xd8\xff"
        return f"seen: {question}"

    monkeypatch.setattr(vlm, "describe_frame", fake_describe)
    store = InMemoryConversationStore()
    out = asyncio.run(run_turn(store, None, "what is this?", image=b"\xff\xd8\xff"))
    assert out.reply == "seen: what is this?"
    turns = store.get(out.session_id)
    assert turns is not None and len(turns) == 2


def test_frame_mint_keeps_provided_unknown_session() -> None:
    # Frame path (use_history=False) keeps a client-supplied id — the
    # durable adapter upserts it; chat path mints fresh instead.
    kept: list[str] = []

    class AppendOnly:
        def __init__(self) -> None:
            self.titles: list[tuple[str, str]] = []

        def get(self, session_id: str) -> list[Turn] | None:
            raise AssertionError("frame path must not read history")

        def create(self) -> str:
            raise AssertionError("frame path must not mint when id given")

        def append(self, session_id: str, turn: Turn) -> None:
            kept.append(session_id)

        def set_title_if_empty(self, session_id: str, title: str) -> None:
            self.titles.append((session_id, title))

    store = AppendOnly()
    asyncio.run(
        run_turn(store, "client-sid", "q", use_history=False, agent=make_echo_agent())
    )
    assert kept == ["client-sid", "client-sid"]  # user + assistant turns
    assert store.titles == [("client-sid", "q")]
