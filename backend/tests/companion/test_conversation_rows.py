"""Row mappers + tool-name threading: metadata persists, content stays text-only."""

import json

from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart

from app.modules.companion import (
    InMemoryConversationStore,
    Turn,
    persist_turn,
    row_to_turn,
    tool_names,
    turn_to_row,
)


def test_tool_names_ordered_deduped() -> None:
    messages = [
        ModelResponse(parts=[ToolCallPart(tool_name="b", args={})]),
        ModelResponse(parts=[TextPart("hi"), ToolCallPart(tool_name="a", args={})]),
        ModelResponse(parts=[ToolCallPart(tool_name="b", args={})]),
    ]
    assert tool_names(messages) == ["b", "a"]
    assert tool_names([]) == []


def test_turn_to_row_serializes_metadata() -> None:
    row = turn_to_row(
        "s", Turn(role="assistant", content="yo", metadata={"tool_calls": ["t"]})
    )
    assert row["metadata"] == json.dumps({"tool_calls": ["t"]})
    assert row["type"] == "text"
    plain = turn_to_row("s", Turn(role="user", content="hi"))
    assert plain["metadata"] is None


def test_row_to_turn_parses_dict_str_and_corrupt() -> None:
    base = {"role": "assistant", "content": "yo", "type": "text"}
    assert row_to_turn({**base, "metadata": {"tool_calls": ["t"]}}).metadata == {
        "tool_calls": ["t"]
    }
    assert row_to_turn({**base, "metadata": '{"tool_calls": ["t"]}'}).metadata == {
        "tool_calls": ["t"]
    }
    assert row_to_turn({**base, "metadata": "not json"}).metadata is None
    assert row_to_turn({k: v for k, v in base.items() if k != "type"}).type == "text"


def test_persist_turn_carries_names_not_content() -> None:
    store = InMemoryConversationStore()
    sid = persist_turn(store, None, "what time?", "The time is x", ["get_current_time"])
    turns = store.get(sid)
    assert turns is not None and len(turns) == 2
    assert turns[1].metadata == {"tool_calls": ["get_current_time"]}
    assert all("get_current_time" not in t.content for t in turns)
