/** Reasoning capture → send-side context → display (Q7=B, TDD).
 * Run: node --test tests/reasoning.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createLocalEngine,
  type LlamaCompletionParams,
  type LlamaCompletionResult,
  type LlamaContextLike,
  type LlamaTokenData,
} from "../lib/inference/local-engine.ts";
import type {
  CompletionCallbacks,
  CompletionMessage,
} from "../lib/inference/engine.ts";
import {
  DEFAULT_SAMPLER,
  parseSampler,
  resolveSampler,
} from "../lib/inference/sampler.ts";
import { createTurnRunner } from "../lib/chat/turn.ts";
import type { CompletionEngine } from "../lib/inference/engine.ts";

function fakeCtx(
  events: LlamaTokenData[],
  result: LlamaCompletionResult,
  capture?: (params: LlamaCompletionParams) => void,
): LlamaContextLike {
  return {
    completion: async (params, onToken) => {
      capture?.(params);
      for (const event of events) onToken?.(event);
      return result;
    },
    stopCompletion: async () => {},
    release: async () => {},
  };
}

const noCallbacks: CompletionCallbacks = { onToken: () => {} };

function run(
  ctx: LlamaContextLike,
  callbacks: CompletionCallbacks,
  messages: CompletionMessage[] = [],
) {
  return createLocalEngine(ctx).completion({ messages, tools: [] }, callbacks);
}

describe("local engine reasoning capture", () => {
  it("always asks llama.rn for reasoning_format auto", async () => {
    const captured: { params: LlamaCompletionParams | null } = { params: null };
    const ctx = fakeCtx([], { text: "" }, (p) => {
      captured.params = p;
    });
    await run(ctx, noCallbacks);
    assert.equal(captured.params?.reasoning_format, "auto");
  });

  it("routes cumulative reasoning to onReasoning and slices content deltas", async () => {
    const ctx = fakeCtx(
      [
        { token: "t1", reasoning_content: "Let me " },
        { token: "t2", reasoning_content: "Let me think." },
        { token: "H", content: "H", reasoning_content: "Let me think." },
        { token: "i", content: "Hi", reasoning_content: "Let me think." },
      ],
      { text: "Hi", content: "Hi", reasoning_content: "Let me think." },
    );
    const reasoning: string[] = [];
    const tokens: string[] = [];
    const out = await run(ctx, {
      onToken: (t) => tokens.push(t),
      onReasoning: (r) => reasoning.push(r),
    });
    assert.deepEqual(reasoning, ["Let me ", "Let me think."]);
    assert.deepEqual(tokens, ["H", "i"]);
    assert.equal(out.reasoning, "Let me think.");
    assert.equal(out.text, "Hi");
  });

  it("falls back to raw tokens when nothing is parsed", async () => {
    const ctx = fakeCtx([{ token: "a" }, { token: "b" }], { text: "ab" });
    const tokens: string[] = [];
    const reasoning: string[] = [];
    await run(ctx, {
      onToken: (t) => tokens.push(t),
      onReasoning: (r) => reasoning.push(r),
    });
    assert.deepEqual(tokens, ["a", "b"]);
    assert.deepEqual(reasoning, []);
  });

  it("drops raw tokens while the event carries only reasoning", async () => {
    const ctx = fakeCtx(
      [
        { token: "L", reasoning_content: "L" },
        { token: "e", reasoning_content: "Le" },
      ],
      { text: "", reasoning_content: "Le" },
    );
    const tokens: string[] = [];
    const reasoning: string[] = [];
    await run(ctx, {
      onToken: (t) => tokens.push(t),
      onReasoning: (r) => reasoning.push(r),
    });
    assert.deepEqual(tokens, [], "reasoning tokens must not leak into the answer");
    assert.deepEqual(reasoning, ["L", "Le"]);
  });

  it("passes reasoning_content on messages through to llama.rn", async () => {
    const captured: { params: LlamaCompletionParams | null } = { params: null };
    const ctx = fakeCtx([], { text: "" }, (p) => {
      captured.params = p;
    });
    await run(
      ctx,
      noCallbacks,
      [
        { role: "user", content: "q" },
        { role: "assistant", content: "a", reasoning_content: "why" },
      ],
    );
    assert.deepEqual(captured.params?.messages, [
      { role: "user", content: "q" },
      { role: "assistant", content: "a", reasoning_content: "why" },
    ]);
  });
});

describe("include_thinking_in_context flag", () => {
  it("defaults on", () => {
    assert.equal(DEFAULT_SAMPLER.includeThinkingInContext, true);
  });

  it("survives parse and resolve", () => {
    const parsed = parseSampler({
      ...DEFAULT_SAMPLER,
      includeThinkingInContext: false,
    });
    assert.equal(parsed.includeThinkingInContext, false);
    const resolved = resolveSampler(DEFAULT_SAMPLER, {
      includeThinkingInContext: false,
    });
    assert.equal(resolved.includeThinkingInContext, false);
  });
});

/** Engine fake that records the messages it was called with. */
function capturingEngine(reply: string, reasoning?: string) {
  const captured: CompletionMessage[][] = [];
  const engine = {
    completion: async (
      request: { messages: CompletionMessage[] },
      callbacks: CompletionCallbacks,
    ) => {
      captured.push(request.messages);
      callbacks.onToken(reply);
      return {
        text: reply,
        ...(reasoning !== undefined ? { reasoning } : {}),
        toolCalls: [],
        promptTokens: 1,
        completionTokens: 1,
        stoppedEarly: false,
      };
    },
    stopCompletion: async () => {},
  };
  return { engine, captured };
}

function turnDeps(over: Record<string, unknown> = {}) {
  return {
    ensureEngine: async () => over["engine"] as CompletionEngine,
    getEngineSource: async () =>
      ({ kind: "local", fileName: "a.gguf" }) as {
        kind: "local";
        fileName: string;
      },
    getStore: async () => null,
    getSearch: async () => null,
    getSystemPrompt: async () => undefined,
    saveImage: async () => null,
    ...over,
  };
}

function historyWithReasoning(): import("../types/chat.ts").ChatMessage[] {
  return [
    { id: "u1", role: "user", text: "why?", at: 0 },
    { id: "a1", role: "assistant", text: "because.", at: 0, reasoning: "user asked why" },
  ];
}

describe("send-side context filter", () => {
  it("sends prior reasoning as reasoning_content when included (default)", async () => {
    const { engine, captured } = capturingEngine("ok");
    const runTurn = createTurnRunner(turnDeps({ engine }));
    await runTurn("next", { sessionId: null, history: historyWithReasoning() });
    const assistant = captured[0].filter((m) => m.role === "assistant");
    assert.equal(assistant[0]?.reasoning_content, "user asked why");
  });

  it("omits reasoning_content when the flag is off", async () => {
    const { engine, captured } = capturingEngine("ok");
    const runTurn = createTurnRunner(
      turnDeps({
        engine,
        getSampler: async () => ({
          ...DEFAULT_SAMPLER,
          includeThinkingInContext: false,
        }),
      }),
    );
    await runTurn("next", { sessionId: null, history: historyWithReasoning() });
    const assistant = captured[0].filter((m) => m.role === "assistant");
    assert.equal(assistant[0]?.reasoning_content, undefined);
  });

  it("never tags user messages with reasoning_content", async () => {
    const { engine, captured } = capturingEngine("ok");
    const runTurn = createTurnRunner(turnDeps({ engine }));
    await runTurn("next", { sessionId: null, history: historyWithReasoning() });
    const users = captured[0].filter((m) => m.role === "user");
    assert.ok(users.length > 0);
    for (const m of users) assert.equal(m.reasoning_content, undefined);
  });

  it("forwards cumulative reasoning to the onReasoning callback", async () => {
    const engine = {
      completion: async (
        _r: unknown,
        callbacks: CompletionCallbacks,
      ) => {
        callbacks.onReasoning?.("part one");
        callbacks.onReasoning?.("part one part two");
        callbacks.onToken("done");
        return {
          text: "done",
          reasoning: "part one part two",
          toolCalls: [],
          promptTokens: 1,
          completionTokens: 1,
          stoppedEarly: false,
        };
      },
      stopCompletion: async () => {},
    };
    const runTurn = createTurnRunner(turnDeps({ engine }));
    const streamed: string[] = [];
    const out = await runTurn(
      "q",
      { sessionId: null, history: [] },
      undefined,
      (cumulative) => streamed.push(cumulative),
    );
    assert.deepEqual(streamed, ["part one", "part one part two"]);
    assert.equal(out.reasoning, "part one part two");
  });

  it("persists the reasoning alongside the assistant turn", async () => {
    const turns: Array<{ role: string; reasoning?: string }> = [];
    const store = {
      create: async () => "s1",
      append: async (
        _id: string,
        turn: { role: string; reasoning?: string },
      ) => {
        turns.push(turn);
      },
      setTitleIfEmpty: async () => {},
    };
    const { engine } = capturingEngine("ok", "the why");
    const runTurn = createTurnRunner(
      turnDeps({ engine, getStore: async () => store }),
    );
    await runTurn("q", { sessionId: null, history: [] });
    const assistant = turns.find((t) => t.role === "assistant");
    assert.equal(assistant?.reasoning, "the why");
  });
});

describe("display seam", () => {
  const item = readFileSync(
    new URL("../components/chat/MessageListItem.tsx", import.meta.url),
    "utf8",
  );

  it("mounts the reasoning block above the answer markdown", () => {
    const block = item.indexOf("ReasoningBlock");
    const markdown = item.indexOf("<MarkdownView");
    assert.ok(block > 0, "MessageListItem renders ReasoningBlock");
    assert.ok(block < markdown, "reasoning renders above the answer");
    // The reasoning block receives its text from the block (which for
    // legacy turns comes from message.reasoning via blocksOf).
    assert.match(item, /text=\{block\.text\}/);
  });

  it("collapses the block once the answer exists", () => {
    assert.match(item, /autoCollapse=/);
  });
});
