/** Store tests. Run: node --test frontend/tests/chat-store.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createChatStore, HISTORY_KEY } from "../store/chat.ts";
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
    mockFetch(async (url) => {
      if (String(url).includes("/api/history")) {
        const sid = new URL(String(url)).searchParams.get("session_id");
        return jsonResponse({ session_id: sid ?? "s1", messages: [] });
      }
      return jsonResponse({ reply: "Echo", session_id: "s1" });
    });
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

  it("attaches the photo to the user message and posts it", async () => {
    let posted: unknown = null;
    mockFetch(async (_url, init) => {
      posted = JSON.parse(String(init?.body));
      return jsonResponse({ reply: "a red mug", session_id: "s1" });
    });
    const useStore = createChatStore(memoryStorage());
    assert.equal(await useStore.getState().send("what?", "data:image/jpeg;base64,AAA"), true);
    const msgs = useStore.getState().messages;
    assert.equal(msgs[0].image, "data:image/jpeg;base64,AAA");
    assert.deepEqual(posted, {
      message: "what?",
      image: "data:image/jpeg;base64,AAA",
    });
    assert.equal(msgs[1].text, "a red mug");
  });

  it("stamps messages with numeric times", async () => {
    const useStore = createChatStore(memoryStorage());
    await useStore.getState().send("hi");
    const msgs = useStore.getState().messages;
    assert.equal(msgs.length, 2);
    assert.ok(msgs.every((m) => typeof m.at === "number"));
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

  it("hydrates the transcript from the server on loadSession", async () => {
    mockFetch(async (url) => {
      if (String(url).includes("/api/history")) {
        return jsonResponse({
          session_id: "s1",
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "Echo: hello" },
          ],
        });
      }
      return jsonResponse({ reply: "Echo", session_id: "s1" });
    });
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    assert.deepEqual(
      useStore.getState().messages.map((m) => [m.role, m.text]),
      [
        ["user", "hello"],
        ["assistant", "Echo: hello"],
      ],
    );
  });

  it("adopts a freshly minted session_id during hydration", async () => {
    mockFetch(async (url) => {
      if (String(url).includes("/api/history"))
        return jsonResponse({ session_id: "fresh", messages: [] });
      return jsonResponse({ reply: "Echo", session_id: "fresh" });
    });
    const storage = memoryStorage({ liai_session_id: "stale" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, "fresh");
    assert.equal(storage.data["liai_session_id"], "fresh");
  });

  it("leaves the transcript alone when hydration fails", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, "s1");
    assert.deepEqual(useStore.getState().messages, []);
  });

  it("records a history entry titled by the first send", async () => {
    const storage = memoryStorage();
    const useStore = createChatStore(storage);
    await useStore.getState().send("hello world");
    const sessions = useStore.getState().sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, "s1");
    assert.equal(sessions[0].title, "hello world");
    assert.ok(typeof sessions[0].at === "number");
    assert.ok(storage.data[HISTORY_KEY]?.includes("hello world"));
  });

  it("keeps one entry per session across sends", async () => {
    const storage = memoryStorage();
    const useStore = createChatStore(storage);
    await useStore.getState().send("first");
    await useStore.getState().send("second");
    const sessions = useStore.getState().sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].title, "first");
  });

  it("switchSession loads another transcript", async () => {
    mockFetch(async (url) => {
      if (String(url).includes("session_id=s2"))
        return jsonResponse({
          session_id: "s2",
          messages: [{ role: "user", content: "old question" }],
        });
      return jsonResponse({ session_id: "s1", messages: [] });
    });
    const storage = memoryStorage({
      liai_session_id: "s1",
      [HISTORY_KEY]: JSON.stringify([
        { id: "s1", title: "current", at: 2 },
        { id: "s2", title: "older", at: 1 },
      ]),
    });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessions.length, 2);
    await useStore.getState().switchSession("s2");
    assert.equal(useStore.getState().sessionId, "s2");
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["old question"],
    );
    assert.equal(storage.data["liai_session_id"], "s2");
  });

  it("deleteSession drops the entry and clears the current view", async () => {
    const storage = memoryStorage({
      liai_session_id: "s1",
      [HISTORY_KEY]: JSON.stringify([
        { id: "s1", title: "current", at: 2 },
        { id: "s2", title: "older", at: 1 },
      ]),
    });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    await useStore.getState().switchSession("s1");
    await useStore.getState().deleteSession("s2");
    assert.deepEqual(
      useStore.getState().sessions.map((s) => s.id),
      ["s1"],
    );
    await useStore.getState().deleteSession("s1");
    assert.deepEqual(useStore.getState().sessions, []);
    assert.equal(useStore.getState().sessionId, null);
    assert.deepEqual(useStore.getState().messages, []);
  });
});
