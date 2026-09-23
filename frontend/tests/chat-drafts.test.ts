/** Per-session composer drafts: keys, switch persistence, send clearing.
 * Run: node --test frontend/tests/chat-drafts.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createChatStore } from "../store/chat.ts";
import { draftKey } from "../lib/chat/drafts.ts";
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

function fakeXhr(chunks: string[]): () => MinimalXhr {
  const xhr: MinimalXhr = {
    responseText: "",
    status: 0,
    timeout: 0,
    onprogress: null,
    onload: null,
    onerror: null,
    ontimeout: null,
    onabort: null,
    open() {},
    setRequestHeader() {},
    send() {
      setTimeout(() => {
        let seen = "";
        for (const chunk of chunks) {
          seen += chunk;
          (xhr as { responseText: string }).responseText = seen;
          xhr.onprogress?.(null);
        }
        (xhr as { status: number }).status = 200;
        xhr.onload?.();
      }, 0);
    },
    abort() {
      xhr.onabort?.();
    },
  };
  return () => xhr;
}

const SEND_OK = [
  'event: start\ndata: {"session_id":"s1"}\n\n',
  'event: token\ndata: {"text":"hi"}\n\n',
  'event: done\ndata: {"session_id":"s1"}\n\n',
];

function mockTwoSessions() {
  mockFetch(async (url) => {
    if (String(url).includes("/api/sessions")) {
      return jsonResponse({
        sessions: [
          { id: "s1", title: "One", pinned: false, updated_at: "t" },
          { id: "s2", title: "Two", pinned: false, updated_at: "t" },
        ],
      });
    }
    if (String(url).includes("/api/history")) {
      const id = String(url).includes("s2") ? "s2" : "s1";
      return jsonResponse({ session_id: id, messages: [] });
    }
    return jsonResponse({ reply: "Echo", session_id: "s1" });
  });
}

describe("draftKey", () => {
  it("namespaces stored drafts per session", () => {
    assert.equal(draftKey("s1"), "liai_draft_s1");
  });

  it("parks the unsent conversation under a fixed new key", () => {
    assert.equal(draftKey(null), "liai_draft_new");
  });
});

describe("chat store drafts", () => {
  beforeEach(() => {
    mockTwoSessions();
  });

  it("starts with an empty draft", async () => {
    const useStore = createChatStore(memoryStorage());
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().draft, "");
  });

  it("persists the old draft and loads the new one on switch", async () => {
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    useStore.getState().setDraft("hello s1");
    assert.equal(await useStore.getState().switchSession("s2"), true);
    assert.equal(storage.data["liai_draft_s1"], "hello s1");
    assert.equal(useStore.getState().draft, "");
    useStore.getState().setDraft("hello s2");
    assert.equal(await useStore.getState().switchSession("s1"), true);
    assert.equal(useStore.getState().draft, "hello s1");
  });

  it("clears the draft and its stored key on send", async () => {
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage, { openXhr: fakeXhr(SEND_OK) });
    await useStore.getState().loadSession();
    useStore.getState().setDraft("typed but sent");
    assert.equal(await useStore.getState().send("typed but sent"), true);
    assert.equal(useStore.getState().draft, "");
    assert.equal(storage.data["liai_draft_s1"], undefined);
  });

  it("restores the parked draft for a fresh conversation", async () => {
    const storage = memoryStorage({ liai_draft_new: "parked" });
    mockFetch(async (url) => {
      if (String(url).includes("/api/sessions")) {
        return jsonResponse({ sessions: [] });
      }
      return jsonResponse({ session_id: "fresh", messages: [] });
    });
    const useStore = createChatStore(storage);
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().draft, "parked");
  });
});
