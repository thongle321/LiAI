/** SSE parser tests. Run: node --test frontend/tests/sse.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createSseAccumulator,
  parseSseBlock,
} from "../lib/chat/sse.ts";

describe("parseSseBlock", () => {
  it("parses a token event", () => {
    assert.deepEqual(parseSseBlock('event: token\ndata: {"text":"hi"}'), {
      type: "token",
      text: "hi",
    });
  });

  it("parses start, done, usage, tool, and error events", () => {
    assert.deepEqual(parseSseBlock('event: start\ndata: {"session_id":"s1"}'), {
      type: "start",
      sessionId: "s1",
    });
    assert.deepEqual(parseSseBlock('event: done\ndata: {"session_id":"s1"}'), {
      type: "done",
      sessionId: "s1",
    });
    assert.deepEqual(
      parseSseBlock(
        'event: usage\ndata: {"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}',
      ),
      { type: "usage", promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    );
    assert.deepEqual(parseSseBlock('event: tool\ndata: {"name":"get_current_time"}'), {
      type: "tool",
      name: "get_current_time",
    });
    assert.deepEqual(
      parseSseBlock('event: error\ndata: {"code":"llm_error","message":"down"}'),
      { type: "error", code: "llm_error", message: "down" },
    );
  });

  it("keeps escaped newlines inside one event", () => {
    assert.deepEqual(parseSseBlock('event: token\ndata: {"text":"a\\nb"}'), {
      type: "token",
      text: "a\nb",
    });
  });

  it("ignores unknown events, garbage, and empties", () => {
    assert.equal(parseSseBlock('event: heartbeat\ndata: {}'), null);
    assert.equal(parseSseBlock("not an event"), null);
    assert.equal(parseSseBlock(""), null);
    assert.equal(parseSseBlock('event: token\ndata: {oops'), null);
  });

  it("rejects malformed shapes", () => {
    assert.equal(parseSseBlock('event: token\ndata: {"nope":1}'), null);
    assert.equal(parseSseBlock('event: start\ndata: {"session_id":42}'), null);
    assert.equal(parseSseBlock("event: done\ndata: {}"), null);
  });
});

describe("createSseAccumulator", () => {
  it("splits two events in one chunk", () => {
    const acc = createSseAccumulator();
    const events = acc.push(
      'event: token\ndata: {"text":"a"}\n\nevent: done\ndata: {"session_id":"s1"}\n\n',
    );
    assert.deepEqual(events, [
      { type: "token", text: "a" },
      { type: "done", sessionId: "s1" },
    ]);
  });

  it("holds a partial chunk until the terminator arrives", () => {
    const acc = createSseAccumulator();
    assert.deepEqual(acc.push('event: token\ndata: {"text":"par'), []);
    assert.deepEqual(acc.push('tial"}\n\n'), [{ type: "token", text: "partial" }]);
  });

  it("drops unknown events but keeps the stream flowing", () => {
    const acc = createSseAccumulator();
    const events = acc.push(
      'event: future\ndata: {"x":1}\n\nevent: token\ndata: {"text":"ok"}\n\n',
    );
    assert.deepEqual(events, [{ type: "token", text: "ok" }]);
  });
});
