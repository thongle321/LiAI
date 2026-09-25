/** Local turn: engine + agent + persisted turns (TDD).
 * Run: node --test frontend/tests/local-turn.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTurnRunner } from "../lib/chat/turn.ts";
import type { CompletionEngine } from "../lib/inference/engine.ts";
import type { ChatMessage } from "../types/chat.ts";

function bubble(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    role: "user",
    text: "hi",
    at: 0,
    ...over,
  };
}

function scriptedEngine(reply: string): CompletionEngine {
  return {
    completion: async (_request, cbs) => {
      cbs.onToken(reply);
      return {
        text: reply,
        toolCalls: [],
        promptTokens: 3,
        completionTokens: 2,
        stoppedEarly: false,
      };
    },
    stopCompletion: async () => {},
  };
}

function memoryStore() {
  const turns: Array<{ session: string; role: string; content: string; metadata: unknown }> = [];
  const titles: Record<string, string> = {};
  return {
    turns,
    titles,
    async create() {
      return "s-new";
    },
    async append(
      sessionId: string,
      turn: { role: "user" | "assistant"; content: string; metadata?: Record<string, unknown> | null },
    ) {
      turns.push({ session: sessionId, role: turn.role, content: turn.content, metadata: turn.metadata ?? null });
    },
    async setTitleIfEmpty(sessionId: string, title: string) {
      if (!titles[sessionId]) titles[sessionId] = title;
    },
  };
}

function deps(over: Record<string, unknown> = {}) {
  return {
    ensureEngine: async () => scriptedEngine("hello"),
    getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }) as const,
    getStore: async () => memoryStore(),
    getSearch: async () => null,
    getSystemPrompt: async () => undefined,
    saveImage: async () => null,
    ...over,
  };
}

describe("createTurnRunner", () => {
  it("answers, persists both turns, and titles from the first message", async () => {
    const store = memoryStore();
    const runTurn = createTurnRunner({
      ...deps(),
      getStore: async () => store,
    });
    const tokens: string[] = [];
    const out = await runTurn(
      "  hello there  ",
      { sessionId: null, history: [] },
      (t) => tokens.push(t),
    );
    assert.equal(out.reply, "hello");
    assert.equal(out.sessionId, "s-new");
    assert.deepEqual(tokens, ["hello"]);
    assert.deepEqual(
      store.turns.map((t) => [t.role, t.content]),
      [
        ["user", "hello there"],
        ["assistant", "hello"],
      ],
    );
    assert.equal(store.titles["s-new"], "hello there");
    assert.equal(out.promptTokens, 3);
    assert.deepEqual(out.steps, []);
  });

  it("reuses an existing session without creating", async () => {
    let creates = 0;
    const store = memoryStore();
    const runTurn = createTurnRunner({
      ...deps(),
      getStore: async () => store,
      ensureEngine: async () => scriptedEngine("yo"),
    });
    const out = await runTurn(
      "again",
      { sessionId: "s1", history: [bubble({ text: "first" })] },
      undefined,
    );
    void creates;
    assert.equal(out.sessionId, "s1");
    assert.equal(out.reply, "yo");
    assert.ok(store.turns.every((t) => t.session === "s1"));
  });

  it("rejects when no model is active", async () => {
    const runTurn = createTurnRunner({ ...deps(), getEngineSource: async () => null });
    await assert.rejects(
      runTurn("hi", { sessionId: null, history: [] }, undefined),
      /no model active/,
    );
  });

  it("rejects blank messages without touching the engine", async () => {
    let calls = 0;
    const runTurn = createTurnRunner({
      ...deps(),
      ensureEngine: async () => {
        calls += 1;
        return scriptedEngine("x");
      },
    });
    await assert.rejects(
      runTurn("   ", { sessionId: null, history: [] }, undefined),
      /empty message/,
    );
    assert.equal(calls, 0);
  });

  it("still answers when the store is gone (ephemeral session)", async () => {
    const runTurn = createTurnRunner({ ...deps(), getStore: async () => null });
    const out = await runTurn("hi", { sessionId: null, history: [] }, undefined);
    assert.equal(out.reply, "hello");
    assert.ok(out.sessionId.startsWith("local-"));
  });

  it("rejects empty replies instead of persisting them", async () => {
    const runTurn = createTurnRunner({
      ...deps(),
      ensureEngine: async () => ({
        completion: async () => ({
          text: "",
          toolCalls: [],
          promptTokens: 1,
          completionTokens: 0,
          stoppedEarly: false,
        }),
        stopCompletion: async () => {},
      }),
    });
    await assert.rejects(
      runTurn("hi", { sessionId: null, history: [] }, undefined),
      /empty reply/,
    );
  });

  it("skips the user append on retry", async () => {
    const store = memoryStore();
    const runTurn = createTurnRunner({
      ...deps(),
      getStore: async () => store,
    });
    const out = await runTurn(
      "again",
      { sessionId: "s1", history: [], retry: true },
      undefined,
    );
    assert.equal(out.reply, "hello");
    assert.deepEqual(
      store.turns.map((t) => [t.role, t.content]),
      [["assistant", "hello"]],
    );
  });

  it("skips empty history stubs when building context", async () => {
    const seen: string[][] = [];
    const engine: CompletionEngine = {
      completion: async (request, cbs) => {
        seen.push(request.messages.map((m) => m.content));
        cbs.onToken("ok");
        return { text: "ok", toolCalls: [], promptTokens: 1, completionTokens: 1, stoppedEarly: false };
      },
      stopCompletion: async () => {},
    };
    const runTurn = createTurnRunner({ ...deps(), ensureEngine: async () => engine });
    await runTurn(
      "q",
      {
        sessionId: "s1",
        history: [bubble({ text: "  " }), bubble({ role: "assistant", text: "" })],
      },
      undefined,
    );
    assert.deepEqual(seen[0], ["q"]);
  });
});
