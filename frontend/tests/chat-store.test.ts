/** Chat store tests (Wave 1: backend-owned sessions + SSE streaming).
 * Run: node --test frontend/tests/chat-store.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createChatStore, SESSION_KEY } from "../store/chat.ts";
import type { MinimalXhr } from "../lib/chat/api.ts";
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

/** Scripted fake XHR: replays chunks on send, then finishes with a status.
 * With auto=false the request stays pending until abort (cancel tests). */
function fakeXhr(
  chunks: string[],
  status = 200,
  auto = true,
): {
  factory: () => MinimalXhr;
  sent: { method: string; url: string; body?: string };
} {
  const sent: { method: string; url: string; body?: string } = {
    method: "",
    url: "",
  };
  let seen = "";
  const xhr: MinimalXhr = {
    responseText: "",
    status: 0,
    timeout: 0,
    onprogress: null,
    onload: null,
    onerror: null,
    ontimeout: null,
    onabort: null,
    open(method: string, url: string) {
      sent.method = method;
      sent.url = url;
    },
    setRequestHeader() {},
    send(body?: string) {
      sent.body = body;
      // Real XHR delivers on later tasks; keep the fake faithful so
      // mid-flight assertions (sending, pending bubble) hold.
      setTimeout(() => {
        if (!auto) return;
        for (const chunk of chunks) {
        seen += chunk;
        (xhr as { responseText: string }).responseText = seen;
        xhr.onprogress?.(null);
        }
        (xhr as { status: number }).status = status;
        xhr.onload?.();
      }, 0);
    },
    abort() {
      xhr.onabort?.();
    },
  };
  return { factory: () => xhr, sent };
}

const STREAM_OK = [
  'event: start\ndata: {"session_id":"s1"}\n\n',
  'event: token\ndata: {"text":"Echo"}\n\n',
  'event: token\ndata: {"text":" hi"}\n\n',
  'event: usage\ndata: {"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}\n\n',
  'event: done\ndata: {"session_id":"s1"}\n\n',
];

function mockSessionsList() {
  mockFetch(async (url) => {
    if (String(url).includes("/api/sessions")) {
      return jsonResponse({
        sessions: [{ id: "s1", title: "Hi", pinned: false, updated_at: "t" }],
      });
    }
    if (String(url).includes("/api/history")) {
      return jsonResponse({ session_id: "s1", messages: [] });
    }
    return jsonResponse({ reply: "Echo", session_id: "s1" });
  });
}

describe("chat store sessions", () => {
  beforeEach(() => {
    mockSessionsList();
  });

  it("loads the backend session list and history on loadSession", async () => {
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    const state = useStore.getState();
    assert.equal(state.sessionId, "s1");
    assert.deepEqual(
      state.sessions.map((s) => s.id),
      ["s1"],
    );
    assert.equal(state.sessions[0].title, "Hi");
  });

  it("starts empty when no session is stored, without minting", async () => {
    let historyCalls = 0;
    mockFetch(async (url) => {
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({ sessions: [] });
      }
      if (String(url).includes("/api/history")) {
        historyCalls += 1;
        return jsonResponse({ session_id: "fresh", messages: [] });
      }
      return jsonResponse({ reply: "Echo", session_id: "fresh" });
    });
    const useStore = createChatStore(memoryStorage());
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, null);
    assert.deepEqual(useStore.getState().messages, []);
    assert.equal(historyCalls, 0);
  });

  it("keeps state when the session list fails", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }));
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, "s1");
    assert.deepEqual(useStore.getState().sessions, []);
  });

  it("drops the legacy on-device history index", async () => {
    const storage = memoryStorage({
      liai_session_id: "s1",
      liai_history_v1: JSON.stringify([{ id: "s1", title: "old", at: 1 }]),
    });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    assert.equal(storage.data["liai_history_v1"], undefined);
  });

  it("switchSession loads backend history with steps and usage", async () => {
    mockFetch(async (url) => {
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({
          sessions: [{ id: "s2", title: "T", pinned: false, updated_at: "t" }],
        });
      }
      if (String(url).includes("session_id=s2")) {
        return jsonResponse({
          session_id: "s2",
          messages: [
            { role: "user", content: "time?" },
            {
              role: "assistant",
              content: "It is noon",
              metadata: {
                tool_calls: ["get_current_time"],
                usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
              },
            },
          ],
        });
      }
      return jsonResponse({ session_id: "s1", messages: [] });
    });
    const storage = memoryStorage();
    const useStore = createChatStore(storage, {
      openXhr: fakeXhr([]).factory,
    });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().switchSession("s2"), true);
    const state = useStore.getState();
    assert.equal(state.sessionId, "s2");
    assert.deepEqual(
      state.messages.map((m) => [m.role, m.text]),
      [
        ["user", "time?"],
        ["assistant", "It is noon"],
      ],
    );
    assert.deepEqual(state.messages[1].steps, [{ tool: "get_current_time" }]);
    assert.deepEqual(state.messages[1].usage, {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    assert.equal(storage.data[SESSION_KEY], "s2");
  });

  it("renameSession patches the backend and updates the row", async () => {
    mockFetch(async (url, init) => {
      if (String(url).includes("/api/sessions") && init?.method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(body, { title: "New" });
        return jsonResponse({
          id: "s1",
          title: "New",
          pinned: false,
          updated_at: "t2",
        });
      }
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({
          sessions: [{ id: "s1", title: "Hi", pinned: false, updated_at: "t" }],
        });
      }
      return jsonResponse({ session_id: "s1", messages: [] });
    });
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }));
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().renameSession("s1", "New"), true);
    assert.equal(useStore.getState().sessions[0].title, "New");
  });

  it("renameSession returns false when the backend rejects", async () => {
    mockFetch(async (url) => {
      if (String(url).includes("/api/sessions") && !String(url).includes("history")) {
        if (url.toString().endsWith("/api/sessions")) {
          return jsonResponse({
            sessions: [{ id: "s1", title: "Hi", pinned: false, updated_at: "t" }],
          });
        }
        return jsonResponse(
          { error: { code: "not_found", message: "gone" } },
          404,
        );
      }
      return jsonResponse({ session_id: "s1", messages: [] });
    });
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }));
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().renameSession("s1", "New"), false);
    assert.equal(useStore.getState().sessions[0].title, "Hi");
  });

  it("setPinned toggles pin state through the backend", async () => {
    mockFetch(async (url, init) => {
      if (String(url).includes("/api/sessions") && init?.method === "PATCH") {
        return jsonResponse({
          id: "s1",
          title: "Hi",
          pinned: true,
          updated_at: "t2",
        });
      }
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({
          sessions: [{ id: "s1", title: "Hi", pinned: false, updated_at: "t" }],
        });
      }
      return jsonResponse({ session_id: "s1", messages: [] });
    });
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }));
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessions[0].pinned, false);
    assert.equal(await useStore.getState().setPinned("s1", true), true);
    assert.equal(useStore.getState().sessions[0].pinned, true);
  });

  it("deleteSession removes the backend session and clears the active view", async () => {
    const deleted: string[] = [];
    mockFetch(async (url, init) => {
      if (String(url).includes("/api/sessions") && init?.method === "DELETE") {
        deleted.push(String(url));
        return jsonResponse({ message: "deleted" });
      }
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({
          sessions: [{ id: "s1", title: "Hi", pinned: false, updated_at: "t" }],
        });
      }
      return jsonResponse({ session_id: "s1", messages: [] });
    });
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    await useStore.getState().deleteSession("s1");
    assert.equal(deleted.length, 1);
    assert.ok(deleted[0].includes("/api/sessions/s1"));
    const state = useStore.getState();
    assert.deepEqual(state.sessions, []);
    assert.equal(state.sessionId, null);
    assert.equal(storage.data[SESSION_KEY], undefined);
  });

  it("newConversation clears the view without a backend call", async () => {
    let posts = 0;
    mockFetch(async (url) => {
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({
          session_id: "s1",
          sessions: [{ id: "s1", title: "Hi", pinned: false, updated_at: "t" }],
        });
      }
      if (String(url).includes("/api/history")) {
        return jsonResponse({ session_id: "s1", messages: [] });
      }
      posts += 1;
      return jsonResponse({ reply: "Echo", session_id: "s1" });
    });
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    await useStore.getState().newConversation();
    const state = useStore.getState();
    assert.equal(state.sessionId, null);
    assert.deepEqual(state.messages, []);
    assert.equal(posts, 0);
  });
});

describe("chat store streaming", () => {
  beforeEach(() => {
    mockSessionsList();
  });

  it("streams tokens into a pending bubble, then finalizes", async () => {
    const { factory, sent } = fakeXhr(STREAM_OK);
    const storage = memoryStorage();
    const useStore = createChatStore(storage, { openXhr: factory });
    const promise = useStore.getState().send("hi");
    assert.equal(useStore.getState().sending, true);
    assert.deepEqual(
      useStore.getState().messages.map((m) => [m.role, m.streaming ?? false]),
      [
        ["user", false],
        ["assistant", true],
      ],
    );
    await promise;
    const state = useStore.getState();
    assert.equal(state.sending, false);
    assert.deepEqual(
      state.messages.map((m) => [m.role, m.text]),
      [
        ["user", "hi"],
        ["assistant", "Echo hi"],
      ],
    );
    assert.equal(state.messages[1].streaming, false);
    assert.deepEqual(state.messages[1].usage, {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    assert.equal(state.sessionId, "s1");
    assert.equal(storage.data[SESSION_KEY], "s1");
    assert.deepEqual(JSON.parse(sent.body ?? ""), { message: "hi", stream: true });
  });

  it("collects tool events into bubble steps", async () => {
    const { factory } = fakeXhr([
      'event: start\ndata: {"session_id":"s1"}\n\n',
      'event: tool\ndata: {"name":"get_current_time"}\n\n',
      'event: token\ndata: {"text":"noon"}\n\n',
      "event: done\ndata: {}\n\n",
    ]);
    const useStore = createChatStore(memoryStorage(), { openXhr: factory });
    await useStore.getState().send("time?");
    assert.deepEqual(useStore.getState().messages[1].steps, [
      { tool: "get_current_time" },
    ]);
  });

  it("marks the user bubble when the stream never opens", async () => {
    const { factory } = fakeXhr(
      ['{"error":{"code":"llm_error","message":"down"}}'],
      502,
    );
    const useStore = createChatStore(memoryStorage(), { openXhr: factory });
    await useStore.getState().send("hi");
    const state = useStore.getState();
    assert.equal(state.sending, false);
    assert.equal(state.messages.length, 1);
    assert.deepEqual(state.messages[0].error, {
      code: "llm_error",
      message: "down",
    });
  });

  it("marks the assistant bubble on mid-stream error events", async () => {
    const { factory } = fakeXhr([
      'event: start\ndata: {"session_id":"s1"}\n\n',
      'event: token\ndata: {"text":"half"}\n\n',
      'event: error\ndata: {"code":"llm_error","message":"cut"}\n\n',
    ]);
    const useStore = createChatStore(memoryStorage(), { openXhr: factory });
    await useStore.getState().send("hi");
    const state = useStore.getState();
    assert.deepEqual(
      state.messages.map((m) => [m.role, m.text]),
      [
        ["user", "hi"],
        ["assistant", "half"],
      ],
    );
    assert.deepEqual(state.messages[1].error, {
      code: "llm_error",
      message: "cut",
    });
  });

  it("retry on a failed assistant streams retry:true without a message", async () => {
    const first = fakeXhr([
      'event: start\ndata: {"session_id":"s1"}\n\n',
      'event: error\ndata: {"code":"timeout","message":"slow"}\n\n',
    ]);
    const second = fakeXhr(STREAM_OK);
    let calls = 0;
    const factory = () => {
      calls += 1;
      return (calls === 1 ? first : second).factory();
    };
    // Capture bodies through a wrapping factory.
    const posted: string[] = [];
    const capturing = () => {
      const xhr = factory();
      const innerSend = xhr.send.bind(xhr);
      xhr.send = (body?: string) => {
        posted.push(body ?? "");
        innerSend(body);
      };
      return xhr;
    };
    const useStore = createChatStore(memoryStorage(), { openXhr: capturing });
    await useStore.getState().send("hi");
    const failedId = useStore.getState().messages[1].id;
    await useStore.getState().retry(failedId);
    assert.deepEqual(
      posted.map((b) => JSON.parse(b)),
      [
        { message: "hi", stream: true },
        { session_id: "s1", stream: true, retry: true },
      ],
    );
    const state = useStore.getState();
    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[1].text, "Echo hi");
    assert.equal(state.messages[1].error, undefined);
  });

  it("regenerate replaces a completed reply through the same retry shape", async () => {
    const posted: string[] = [];
    const factory = () => {
      const xhr = fakeXhr(STREAM_OK).factory();
      const innerSend = xhr.send.bind(xhr);
      xhr.send = (body?: string) => {
        posted.push(body ?? "");
        innerSend(body);
      };
      return xhr;
    };
    const useStore = createChatStore(memoryStorage(), { openXhr: factory });
    await useStore.getState().send("hi");
    const assistantId = useStore.getState().messages[1].id;
    await useStore.getState().regenerate(assistantId);
    assert.deepEqual(
      posted.map((b) => JSON.parse(b)),
      [
        { message: "hi", stream: true },
        { session_id: "s1", stream: true, retry: true },
      ],
    );
    assert.equal(useStore.getState().messages[1].text, "Echo hi");
  });

  it("retry on a failed user bubble resends as a fresh turn", async () => {
    const posted: string[] = [];
    const bad = fakeXhr(['{"error":{"code":"network","message":"down"}}'], 0);
    const good = fakeXhr(STREAM_OK);
    let calls = 0;
    const factory = () => {
      calls += 1;
      const xhr = (calls === 1 ? bad : good).factory();
      const innerSend = xhr.send.bind(xhr);
      xhr.send = (body?: string) => {
        posted.push(body ?? "");
        innerSend(body);
      };
      return xhr;
    };
    const useStore = createChatStore(memoryStorage(), { openXhr: factory });
    await useStore.getState().send("hi");
    const userId = useStore.getState().messages[0].id;
    await useStore.getState().retry(userId);
    assert.deepEqual(
      posted.map((b) => JSON.parse(b)),
      [
        { message: "hi", stream: true },
        { message: "hi", stream: true },
      ],
    );
    const state = useStore.getState();
    assert.deepEqual(
      state.messages.map((m) => [m.role, m.text]),
      [
        ["user", "hi"],
        ["assistant", "Echo hi"],
      ],
    );
    assert.equal(state.messages[0].error, undefined);
  });

  it("blocked sends return false and change nothing", async () => {
    const useStore = createChatStore(memoryStorage(), {
      openXhr: fakeXhr([]).factory,
    });
    assert.equal(await useStore.getState().send("   "), false);
    assert.deepEqual(useStore.getState().messages, []);
  });

  it("ignores a second send while a stream is in flight", async () => {
    const { factory } = fakeXhr(STREAM_OK);
    const useStore = createChatStore(memoryStorage(), { openXhr: factory });
    const first = useStore.getState().send("one");
    assert.equal(await useStore.getState().send("two"), false);
    await first;
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["one", "Echo hi"],
    );
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

  it("records a vision turn locally without a backend POST", async () => {
    let posts = 0;
    mockFetch(async (url) => {
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({ sessions: [] });
      }
      posts += 1;
      return jsonResponse({ reply: "x", session_id: "s1" });
    });
    const useStore = createChatStore(memoryStorage());
    await useStore
      .getState()
      .recordVisionTurn(
        "what is this?",
        "a chair",
        "vision-1",
        "data:image/jpeg;base64,AAA",
      );
    const state = useStore.getState();
    assert.equal(state.sessionId, "vision-1");
    assert.deepEqual(
      state.messages.map((m) => [m.role, m.text]),
      [
        ["user", "what is this?"],
        ["assistant", "a chair"],
      ],
    );
    assert.equal(state.messages[0].image, "data:image/jpeg;base64,AAA");
    assert.equal(posts, 0);
  });
});
