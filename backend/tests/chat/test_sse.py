"""SSE framing tests: exact wire bytes for the chat stream (Wave 1 contract)."""

from app.modules.chat.internal.sse import format_event


def test_token_event_exact_bytes() -> None:
    assert (
        format_event("token", {"text": "hi"}) == 'event: token\ndata: {"text":"hi"}\n\n'
    )


def test_done_event_carries_session() -> None:
    assert format_event("done", {"session_id": "s1"}) == (
        'event: done\ndata: {"session_id":"s1"}\n\n'
    )


def test_newlines_in_text_stay_single_line() -> None:
    out = format_event("token", {"text": "a\nb"})
    assert out == 'event: token\ndata: {"text":"a\\nb"}\n\n'
    assert out.count("\n") == 3
