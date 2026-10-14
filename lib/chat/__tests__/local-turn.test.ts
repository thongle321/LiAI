/** Local turn: engine + agent + persisted turns (TDD).
 * Run: node --test frontend/tests/local-turn.test.ts */

import { createTurnRunner } from "../turn.ts";
import type { CompletionEngine } from "../../inference/engine.ts";
import type { ChatMessage } from "../../../types/chat.ts";

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
  const turns: Array<{
    session: string;
    role: string;
    content: string;
    reasoning?: string;
    metadata: unknown;
  }> = [];
  const titles: Record<string, string> = {};
  return {
    turns,
    titles,
    async create() {
      return "s-new";
    },
    async append(
      sessionId: string,
      turn: {
        role: "user" | "assistant";
        content: string;
        reasoning?: string;
        metadata?: Record<string, unknown> | null;
      },
    ) {
      turns.push({
        session: sessionId,
        role: turn.role,
        content: turn.content,
        ...(turn.reasoning !== undefined ? { reasoning: turn.reasoning } : {}),
        metadata: turn.metadata ?? null,
      });
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
    expect(out.reply).toBe("hello");
    expect(out.sessionId).toBe("s-new");
    expect(tokens).toEqual(["hello"]);
    expect(store.turns.map((t) => [t.role, t.content])).toEqual([
        ["user", "hello there"],
        ["assistant", "hello"],
      ]);
    expect(store.titles["s-new"]).toBe("hello there");
    expect(out.promptTokens).toBe(3);
    expect(out.steps).toEqual([]);
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
    expect(out.sessionId).toBe("s1");
    expect(out.reply).toBe("yo");
    expect(store.turns.every((t) => t.session === "s1")).toBeTruthy();
  });

  it("rejects when no model is active", async () => {
    const runTurn = createTurnRunner({ ...deps(), getEngineSource: async () => null });
    await await expect(runTurn("hi", { sessionId: null, history: [] }, undefined)).rejects.toThrow(/no model active/);
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
    await await expect(runTurn("   ", { sessionId: null, history: [] }, undefined)).rejects.toThrow(/empty message/);
    expect(calls).toBe(0);
  });

  it("still answers when the store is gone (ephemeral session)", async () => {
    const runTurn = createTurnRunner({ ...deps(), getStore: async () => null });
    const out = await runTurn("hi", { sessionId: null, history: [] }, undefined);
    expect(out.reply).toBe("hello");
    expect(out.sessionId.startsWith("local-")).toBeTruthy();
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
    await await expect(runTurn("hi", { sessionId: null, history: [] }, undefined)).rejects.toThrow(/empty reply/);
  });

  it("removes the saved image files after a successful turn", async () => {
    const removed: string[] = [];
    const images = ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BB"];
    const runTurn = createTurnRunner({
      ...deps(),
      saveImage: async (uri: string) => `/tmp/img-${uri.length}.jpg`,
      removeImages: async (paths: string[]) => {
        removed.push(...paths);
      },
    });
    const out = await runTurn(
      "look",
      { sessionId: "s1", history: [], images },
      undefined,
    );
    expect(out.reply).toBe("hello");
    expect(removed).toEqual(images.map((u) => `/tmp/img-${u.length}.jpg`));
  });

  it("removes the saved image files even when the run fails", async () => {
    const removed: string[] = [];
    const runTurn = createTurnRunner({
      ...deps(),
      ensureEngine: async () => ({
        completion: async () => {
          throw new Error("boom");
        },
        stopCompletion: async () => {},
      }),
      saveImage: async (uri: string) => `/tmp/img-${uri.length}.jpg`,
      removeImages: async (paths: string[]) => {
        removed.push(...paths);
      },
    });
    const images = ["data:image/jpeg;base64,AAA"];
    await await expect(runTurn(
        "look",
        { sessionId: "s1", history: [], images },
        undefined,
      )).rejects.toBeTruthy();
    expect(removed).toEqual(images.map((u) => `/tmp/img-${u.length}.jpg`));
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
    expect(out.reply).toBe("hello");
    expect(store.turns.map((t) => [t.role, t.content])).toEqual([["assistant", "hello"]]);
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
    expect(seen[0]).toEqual(["q"]);
  });
});
