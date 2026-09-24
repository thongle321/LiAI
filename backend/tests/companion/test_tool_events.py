"""Tool call/return pairing: framework messages -> running/done runs (pure)."""

from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

from app.modules.companion.agent import ToolRun, tool_events


def _call(call_id: str, name: str, args: dict) -> ModelResponse:
    return ModelResponse(
        parts=[ToolCallPart(tool_name=name, args=args, tool_call_id=call_id)]
    )


def _return(call_id: str, name: str, content: str) -> ModelRequest:
    return ModelRequest(
        parts=[ToolReturnPart(tool_name=name, tool_call_id=call_id, content=content)]
    )


def test_pairs_call_with_return() -> None:
    messages: list[ModelMessage] = [
        ModelRequest(parts=[UserPromptPart("hi")]),
        _call("c1", "calculate", {"expression": "2+2"}),
        _return("c1", "calculate", "4"),
        ModelResponse(parts=[TextPart("Four")]),
    ]
    assert tool_events(messages) == [
        ToolRun(
            id="c1",
            name="calculate",
            status="running",
            input={"expression": "2+2"},
            result=None,
        ),
        ToolRun(
            id="c1",
            name="calculate",
            status="done",
            input={"expression": "2+2"},
            result="4",
        ),
    ]


def test_unmatched_call_closes_without_result() -> None:
    messages: list[ModelMessage] = [
        _call("c9", "read_url", {"url": "https://x.example"})
    ]
    assert tool_events(messages) == [
        ToolRun(
            id="c9",
            name="read_url",
            status="running",
            input={"url": "https://x.example"},
            result=None,
        ),
        ToolRun(
            id="c9",
            name="read_url",
            status="done",
            input={"url": "https://x.example"},
            result=None,
        ),
    ]


def test_order_and_multiplicity_preserved() -> None:
    messages: list[ModelMessage] = [
        _call("c1", "web_search", {"query": "a"}),
        _call("c2", "web_search", {"query": "b"}),
        _return("c2", "web_search", "B"),
        _return("c1", "web_search", "A"),
    ]
    runs = tool_events(messages)
    assert [(r.id, r.name, r.status, r.result) for r in runs] == [
        ("c1", "web_search", "running", None),
        ("c2", "web_search", "running", None),
        ("c2", "web_search", "done", "B"),
        ("c1", "web_search", "done", "A"),
    ]
    assert [r.input for r in runs if r.status == "done"] == [
        {"query": "b"},
        {"query": "a"},
    ]


def test_empty_history_has_no_runs() -> None:
    assert tool_events([]) == []


def test_string_args_parsed() -> None:
    """Streamed turns carry raw JSON args (framework variance)."""
    messages: list[ModelMessage] = [
        ModelResponse(
            parts=[
                ToolCallPart(
                    tool_name="web_search", args='{"query": "q"}', tool_call_id="w1"
                )
            ]
        ),
        _return("w1", "web_search", "R"),
    ]
    assert tool_events(messages) == [
        ToolRun(
            id="w1",
            name="web_search",
            status="running",
            input={"query": "q"},
            result=None,
        ),
        ToolRun(
            id="w1", name="web_search", status="done", input={"query": "q"}, result="R"
        ),
    ]
