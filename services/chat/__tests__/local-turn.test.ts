/** Local turn: engine + agent + persisted turns. */

import { createTurnRunner } from "../turn.ts";
import type { CompletionEngine } from "@/services/inference/engine.ts";
import type { ChatMessage } from "@/types/chat.ts";

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
    engine: {
      ensureEngine: async () => scriptedEngine("hello"),
      getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }) as const,
    },
    store: {
      getStore: async () => memoryStore(),
      getSearch: async () => null,
    },
    prompt: {
      getSystemPrompt: async () => undefined,
    },
    media: {
      resolveImage: async () => null,
    },
    ...over,
  };
}

describe("createTurnRunner", () => {
  it("answers, persists both turns, and titles from the first message", async () => {
    const store = memoryStore();
    const runTurn = createTurnRunner({
      ...deps(),
      store: { ...deps().store, getStore: async () => store },
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
      store: { ...deps().store, getStore: async () => store },
      engine: { ...deps().engine, ensureEngine: async () => scriptedEngine("yo") },
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
    const runTurn = createTurnRunner({
      ...deps(),
      engine: { ...deps().engine, getEngineSource: async () => null },
    });
    await await expect(runTurn("hi", { sessionId: null, history: [] }, undefined)).rejects.toThrow(/no model active/);
  });

  it("rejects blank messages without touching the engine", async () => {
    let calls = 0;
    const runTurn = createTurnRunner({
      ...deps(),
      engine: {
        ...deps().engine,
        ensureEngine: async () => {
          calls += 1;
          return scriptedEngine("x");
        },
      },
    });
    await await expect(runTurn("   ", { sessionId: null, history: [] }, undefined)).rejects.toThrow(/empty message/);
    expect(calls).toBe(0);
  });

  it("still answers when the store is gone (ephemeral session)", async () => {
    const runTurn = createTurnRunner({
      ...deps(),
      store: { ...deps().store, getStore: async () => null },
    });
    const out = await runTurn("hi", { sessionId: null, history: [] }, undefined);
    expect(out.reply).toBe("hello");
    expect(out.sessionId.startsWith("local-")).toBeTruthy();
  });

  it("rejects empty replies instead of persisting them", async () => {
    const runTurn = createTurnRunner({
      ...deps(),
      engine: {
        ...deps().engine,
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
      },
    });
    await await expect(runTurn("hi", { sessionId: null, history: [] }, undefined)).rejects.toThrow(/empty reply/);
  });

  it("removes only the files the turn itself wrote (D5-4)", async () => {
    const removed: string[] = [];
    const images = ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BB"];
    const runTurn = createTurnRunner({
      ...deps(),
      media: {
        ...deps().media,
        resolveImage: async (uri: string) => ({ path: `/tmp/img-${uri.length}.jpg`, owned: true }),
        removeImages: async (paths: string[]) => {
          removed.push(...paths);
        },
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

  it("keeps a borrowed attachment: the history still renders that photo", async () => {
    // The picked file is the message's own attachment, so deleting it
    // would blank a thumbnail the user can still see (D5-4).
    const removed: string[] = [];
    const requests: Array<{ imagePaths?: string[] }> = [];
    const runTurn = createTurnRunner({
      ...deps({
        engine: {
          ...deps().engine,
          ensureEngine: async () => ({
            completion: async (request: { imagePaths?: string[] }) => {
              requests.push(request);
              return scriptedEngine("a cat").completion(
                { messages: [] } as never,
                { onToken: () => {} },
              );
            },
            stopCompletion: async () => {},
          }),
        },
      }),
      media: {
        ...deps().media,
        resolveImage: async (value: string) => ({ path: value, owned: false }),
        removeImages: async (paths: string[]) => {
          removed.push(...paths);
        },
      },
    });
    const out = await runTurn(
      "look",
      { sessionId: "s1", history: [], images: ["file:///cache/a.jpg"] },
      undefined,
    );
    expect(out.reply).toBe("a cat");
    expect(requests[0].imagePaths).toEqual(["file:///cache/a.jpg"]);
    expect(removed).toEqual([]);
  });

  it("never encodes for a local turn, and encodes for a remote one (D5-4)", async () => {
    // The local engine reads media_paths as they stand; only a remote
    // server, which cannot see our cache directory, needs a data URI.
    const requests: Array<Record<string, unknown>> = [];
    const remote = {
      kind: "remote",
      provider: {
        id: "p1",
        name: "Test",
        providerType: "custom_openai",
        baseUrl: "https://example.test/v1",
        apiKey: "k",
        modelName: "gpt-test",
        isActive: true,
      },
    } as const;
    const capturing = async (request: Record<string, unknown>) => {
      requests.push(request);
      return scriptedEngine("ok").completion(
        { messages: [] } as never,
        { onToken: () => {} },
      );
    };
    const base = {
      media: {
        resolveImage: async (value: string) => ({ path: value, owned: false }),
        toDataUris: async (images: string[]) => images.map((u) => `encoded(${u})`),
      },
      engine: {
        ensureEngine: async () => ({
          completion: capturing,
          stopCompletion: async () => {},
        }),
      },
    };
    const image = "file:///cache/a.jpg";

    await createTurnRunner({
      ...deps(base),
      engine: { ...deps(base).engine, getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }) as const },
    })("look", { sessionId: "s1", history: [], images: [image] }, undefined);
    expect(requests[0].imageDataUris).toBe(undefined);
    expect(requests[0].imagePaths).toEqual([image]);

    await createTurnRunner({
      ...deps(base),
      engine: { ...deps(base).engine, getEngineSource: async () => remote },
    })("look", { sessionId: "s1", history: [], images: [image] }, undefined);
    expect(requests[1].imageDataUris).toEqual([`encoded(${image})`]);
    expect(requests[1].imagePaths).toEqual([image]);
  });

  it("removes the saved image files even when the run fails", async () => {
    const removed: string[] = [];
    const runTurn = createTurnRunner({
      ...deps(),
      engine: {
        ...deps().engine,
        ensureEngine: async () => ({
          completion: async () => {
            throw new Error("boom");
          },
          stopCompletion: async () => {},
        }),
      },
      media: {
        ...deps().media,
        resolveImage: async (uri: string) => ({ path: `/tmp/img-${uri.length}.jpg`, owned: true }),
        removeImages: async (paths: string[]) => {
          removed.push(...paths);
        },
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
      store: { ...deps().store, getStore: async () => store },
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
    const runTurn = createTurnRunner({
      ...deps(),
      engine: { ...deps().engine, ensureEngine: async () => engine },
    });
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
