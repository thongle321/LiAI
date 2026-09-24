/* QVAC adapter contract: QVAC SDK shapes in, CompletionEngine out.
 * Run: node --test frontend/tests/qvac-engine.test.ts */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  createQvacEngine,
  type QvacClientLike,
  type QvacEvent,
} from "../lib/inference/qvac-engine.ts";

function fakeClient(events: QvacEvent[], final: Record<string, unknown>) {
  const calls: { completions: unknown[]; cancels: string[] } = {
    completions: [],
    cancels: [],
  };
  const client: QvacClientLike = {
    completion: (params) => {
      calls.completions.push(params);
      return {
        requestId: "req-1",
        events: (async function* () {
          for (const e of events) yield e;
        })(),
        final: Promise.resolve(final),
      };
    },
    cancel: async (params) => {
      calls.cancels.push(params.requestId);
    },
  };
  return { client, calls };
}

describe("createQvacEngine", () => {
  it("streams text deltas and returns final text plus stats", async () => {
    const { client, calls } = fakeClient(
      [
        { type: "contentDelta", text: "hel" },
        { type: "thinkingDelta", text: "should-drop" },
        { type: "rawDelta", text: "should-drop-too" },
        { type: "contentDelta", text: "lo" },
        { type: "completionDone", stopReason: "eos" },
      ],
      {
        contentText: "hello",
        toolCalls: [],
        stats: { promptTokens: 3, generatedTokens: 2 },
      },
    );
    const seen: string[] = [];
    const out = await createQvacEngine(client, "m1").completion(
      { messages: [{ role: "user", content: "hi" }] },
      { onToken: (t) => seen.push(t) },
    );
    assert.deepEqual(seen, ["hel", "lo"]);
    assert.equal(out.text, "hello");
    assert.equal(out.promptTokens, 3);
    assert.equal(out.completionTokens, 2);
    assert.equal(out.stoppedEarly, false);
    assert.equal(calls.completions.length, 1);
  });

  it("projects tool calls with JSON arguments", async () => {
    const seen: Array<{ id: string; name: string; arguments: string }>[] = [];
    const { client } = fakeClient(
      [
        {
          type: "toolCall",
          call: { id: "c1", name: "datetime", arguments: { timezone: "UTC" } },
        },
        { type: "completionDone", stopReason: "eos" },
      ],
      {
        contentText: "",
        toolCalls: [{ id: "c1", name: "datetime", arguments: { timezone: "UTC" } }],
      },
    );
    const out = await createQvacEngine(client, "m1").completion(
      { messages: [{ role: "user", content: "time?" }] },
      {
        onToken: () => {},
        onToolCalls: (c) => seen.push(c),
      },
    );
    assert.equal(out.toolCalls.length, 1);
    assert.deepEqual(out.toolCalls[0], {
      id: "c1",
      name: "datetime",
      arguments: JSON.stringify({ timezone: "UTC" }),
    });
    assert.equal(seen.length, 1);
  });

  it("marks cancelled stop reasons as stopped early", async () => {
    const { client } = fakeClient(
      [{ type: "completionDone", stopReason: "cancelled" }],
      { contentText: "", toolCalls: [] },
    );
    const out = await createQvacEngine(client, "m1").completion(
      { messages: [{ role: "user", content: "hi" }] },
      { onToken: () => {} },
    );
    assert.equal(out.stoppedEarly, true);
  });

  it("stopCompletion cancels the in-flight run, no-ops when idle", async () => {
    const { client, calls } = fakeClient([], { contentText: "", toolCalls: [] });
    const engine = createQvacEngine(client, "m1");
    await engine.stopCompletion();
    assert.deepEqual(calls.cancels, []);
    const pending = engine.completion(
      { messages: [{ role: "user", content: "hi" }] },
      { onToken: () => {} },
    );
    await engine.stopCompletion();
    await pending;
    assert.deepEqual(calls.cancels, ["req-1"]);
  });

  it("attaches image paths to the last user message, file:// stripped", async () => {
    const { client, calls } = fakeClient(
      [{ type: "completionDone", stopReason: "eos" }],
      { contentText: "a chair", toolCalls: [] },
    );
    await createQvacEngine(client, "m1").completion(
      {
        messages: [
          { role: "user", content: "first" },
          { role: "assistant", content: "ok" },
          { role: "user", content: "what is this?" },
        ],
        imagePaths: ["file:///tmp/chat-images/a.jpg"],
      },
      { onToken: () => {} },
    );
    const params = calls.completions[0] as {
      history: Array<{ role: string; attachments?: Array<{ path: string }> }>;
    };
    assert.deepEqual(params.history[2]?.attachments, [
      { path: "/tmp/chat-images/a.jpg" },
    ]);
    assert.equal(params.history[0]?.attachments, undefined);
  });

  it("maps tool-role messages to user content and tools to QVAC shape", async () => {
    const { client, calls } = fakeClient(
      [{ type: "completionDone", stopReason: "eos" }],
      { contentText: "done", toolCalls: [] },
    );
    await createQvacEngine(client, "m1").completion(
      {
        messages: [
          { role: "user", content: "time?" },
          { role: "tool", content: "12:00", tool_call_id: "c1", name: "datetime" },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "datetime",
              description: "clock",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      },
      { onToken: () => {} },
    );
    const params = calls.completions[0] as {
      history: Array<{ role: string; content: string }>;
      tools: Array<{ type: string; name: string; parameters: unknown }>;
    };
    assert.deepEqual(
      params.history.map((m) => [m.role, m.content]),
      [
        ["user", "time?"],
        ["user", "12:00"],
      ],
    );
    assert.deepEqual(params.tools, [
      {
        type: "function",
        name: "datetime",
        description: "clock",
        parameters: { type: "object", properties: {} },
      },
    ]);
  });
});
