/** Store tests. Run: node --test frontend/tests/chat-store.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createChatStore } from "../store/chat.ts";
import type { KeyValueStorage } from "../lib/storage.ts";

function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

function mockFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
): void {
  (globalThis as Record<string, unknown>).fetch = impl;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("chat store", () => {
  beforeEach(() => {
    mockFetch(async () => jsonResponse({ reply: "Echo", session_id: "s1" }));
  });

  it("loads a persisted session_id", async () => {
    const storage = memoryStorage({ liai_session_id: "persisted" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, "persisted");
  });

  it("sends optimistically, then appends the reply and persists session", async () => {
    const storage = memoryStorage();
    const useStore = createChatStore(storage);
    const promise = useStore.getState().send("hi");
    assert.equal(useStore.getState().sending, true);
    assert.equal(useStore.getState().messages.length, 1);
    await promise;
    const state = useStore.getState();
    assert.equal(state.sending, false);
    assert.deepEqual(
      state.messages.map((m) => m.role),
      ["user", "assistant"],
    );
    assert.equal(state.sessionId, "s1");
    assert.equal(storage.data["liai_session_id"], "s1");
  });

  it("blocked sends return false and change nothing", async () => {
    const useStore = createChatStore(memoryStorage());
    assert.equal(await useStore.getState().send("   "), false);
    assert.deepEqual(useStore.getState().messages, []);
  });

  it("ignores a second send while one is in flight", async () => {
    let resolveFetch!: (r: Response) => void;
    mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const useStore = createChatStore(memoryStorage());
    const first = useStore.getState().send("one");
    assert.equal(await useStore.getState().send("two"), false);
    assert.equal(useStore.getState().messages.length, 1);
    resolveFetch(jsonResponse({ reply: "Echo", session_id: "s1" }));
    await first;
    assert.equal(useStore.getState().messages.length, 2);
  });

  it("marks the message with the envelope error on failure", async () => {
    mockFetch(async () =>
      jsonResponse({ error: { code: "llm_error", message: "down" } }, 502),
    );
    const useStore = createChatStore(memoryStorage());
    await useStore.getState().send("hi");
    const state = useStore.getState();
    assert.equal(state.sending, false);
    assert.equal(state.messages.length, 1);
    assert.deepEqual(state.messages[0].error, {
      code: "llm_error",
      message: "down",
    });
  });

  it("retry resends the failed message and clears the error", async () => {
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(
          { error: { code: "timeout", message: "slow" } },
          504,
        );
      }
      return jsonResponse({ reply: "Echo", session_id: "s1" });
    });
    const useStore = createChatStore(memoryStorage());
    await useStore.getState().send("hi");
    const id = useStore.getState().messages[0].id;
    await useStore.getState().retry(id);
    const state = useStore.getState();
    assert.equal(calls, 2);
    assert.equal(state.messages[state.messages.length - 1].role, "assistant");
    assert.ok(state.messages.every((m) => m.error === undefined));
  });

  it("newConversation clears session and transcript", async () => {
    const storage = memoryStorage();
    const useStore = createChatStore(storage);
    await useStore.getState().send("hi");
    await useStore.getState().newConversation();
    const state = useStore.getState();
    assert.equal(state.sessionId, null);
    assert.deepEqual(state.messages, []);
    assert.equal(storage.data["liai_session_id"], undefined);
  });

  it("checkHealth flips connection up and down", async () => {
    const useStore = createChatStore(memoryStorage());
    mockFetch(async () => jsonResponse({ status: "ok" }));
    await useStore.getState().checkHealth();
    assert.equal(useStore.getState().connection, "up");
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await useStore.getState().checkHealth();
    assert.equal(useStore.getState().connection, "down");
  });
});
