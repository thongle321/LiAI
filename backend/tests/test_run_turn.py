"""Turn lifecycle seam: run_turn owns load/mint → reply → persist.

Routes (HTTP chat, frame Q&A) delegate; the persist/no-history choice
is one visible argument at the call site.
"""

import asyncio

import pytest

from app.memory import InMemoryConversationStore, Turn
from app.turns import StoreError, run_turn


def test_text_turn_mints_session_and_persists() -> None:
    store = InMemoryConversationStore()
    out = asyncio.run(run_turn(store, None, "hi"))
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
    out = asyncio.run(run_turn(store, sid, "hi"))
    assert out.session_id == sid
    turns = store.get(sid)
    assert turns is not None and len(turns) == 4


def test_use_history_false_never_reads_store() -> None:
    appended: list[Turn] = []

    class SpyStore:
        def __init__(self) -> None:
            self.gets = 0

        def get(self, session_id: str) -> list[Turn] | None:
            self.gets += 1
            return None

        def create(self) -> str:
            raise AssertionError("mint must not happen when session_id given")

        def append(self, session_id: str, turn: Turn) -> None:
            assert session_id == "s1"
            appended.append(turn)

    spy = SpyStore()
    out = asyncio.run(
        run_turn(spy, "s1", "what?", prompt="composed prompt", use_history=False)
    )
    assert spy.gets == 0
    assert out.session_id == "s1"
    assert appended[0].content == "what?"  # user text, not the composed prompt


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


def test_llm_failure_bubbles_not_store_error(broken_agent) -> None:  # type: ignore[no-untyped-def]
    store = InMemoryConversationStore()
    with pytest.raises(Exception) as excinfo:
        asyncio.run(run_turn(store, None, "hi"))
    assert not isinstance(excinfo.value, StoreError)
    assert "db down" not in str(excinfo.value)


def test_image_turn_replies_through_vlm(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.realtime import vlm

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
        def get(self, session_id: str) -> list[Turn] | None:
            raise AssertionError("frame path must not read history")

        def create(self) -> str:
            raise AssertionError("frame path must not mint when id given")

        def append(self, session_id: str, turn: Turn) -> None:
            kept.append(session_id)

    asyncio.run(run_turn(AppendOnly(), "client-sid", "q", use_history=False))
    assert kept == ["client-sid", "client-sid"]  # user + assistant turns
