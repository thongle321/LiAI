/** Chat API client tests. Run: node --test frontend/tests/chat-api.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deleteSession,
  listSessions,
  postChatStream,
  updateSession,
  type MinimalXhr,
} from "../lib/chat/api.ts";
import type { ChatStreamEvent } from "../lib/chat/sse.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
): void {
  (globalThis as Record<string, unknown>).fetch = impl;
}

/** Scripted fake XHR: replays progress chunks, then finishes with a status.
 * With auto=false the request stays pending until abort (for cancel tests). */
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
      if (!auto) return;
      for (const chunk of chunks) {
        seen += chunk;
        (xhr as { responseText: string }).responseText = seen;
        xhr.onprogress?.(null);
      }
      (xhr as { status: number }).status = status;
      xhr.onload?.();
    },
    abort() {
      xhr.onabort?.();
    },
  };
  return { factory: () => xhr, sent };
}

describe("sessions client", () => {
  it("lists sessions", async () => {
    mockFetch(async (url) => {
      assert.ok(String(url).endsWith("/api/sessions"));
      return jsonResponse({
        sessions: [{ id: "s1", title: "Hi", pinned: false, updated_at: "t" }],
      });
    });
    const sessions = await listSessions();
    assert.deepEqual(sessions, [
      { id: "s1", title: "Hi", pinned: false, updated_at: "t" },
    ]);
  });

  it("updates a session", async () => {
    mockFetch(async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), { title: "New" });
      return jsonResponse({ id: "s1", title: "New", pinned: false, updated_at: "t" });
    });
    const updated = await updateSession("s1", { title: "New" });
    assert.equal(updated.title, "New");
  });

  it("deletes a session", async () => {
    mockFetch(async (url, init) => {
      assert.ok(String(url).endsWith("/api/sessions/s1"));
      assert.equal(init?.method, "DELETE");
      return jsonResponse({ message: "deleted" });
    });
    await deleteSession("s1");
  });

  it("throws the envelope error on failure", async () => {
    mockFetch(async () =>
      jsonResponse({ error: { code: "not_found", message: "gone" } }, 404),
    );
    await assert.rejects(deleteSession("nope"), { code: "not_found" });
  });
});

describe("postChatStream", () => {
  it("posts stream:true and delivers events in order", async () => {
    const { factory, sent } = fakeXhr([
      'event: start\ndata: {"session_id":"s9"}\n\n',
      'event: token\ndata: {"text":"Echo"}\n\n',
      'event: token\ndata: {"text":" hi"}\n\nevent: done\ndata: {"session_id":"s9"}\n\n',
    ]);
    const seen: ChatStreamEvent[] = [];
    await postChatStream(
      { message: "hi", stream: true },
      (event) => seen.push(event),
      factory,
    ).done;
    assert.equal(sent.method, "POST");
    assert.ok(sent.url.endsWith("/api/chat"));
    assert.deepEqual(JSON.parse(sent.body ?? ""), { message: "hi", stream: true });
    assert.deepEqual(seen, [
      { type: "start", sessionId: "s9" },
      { type: "token", text: "Echo" },
      { type: "token", text: " hi" },
      { type: "done", sessionId: "s9" },
    ]);
  });

  it("rejects with the envelope on non-200", async () => {
    const { factory } = fakeXhr(
      ['{"error":{"code":"llm_error","message":"down"}}'],
      502,
    );
    const seen: ChatStreamEvent[] = [];
    await assert.rejects(
      postChatStream({ message: "hi", stream: true }, (e) => seen.push(e), factory)
        .done,
      { code: "llm_error" },
    );
    assert.deepEqual(seen, []);
  });

  it("rejects cancelled when aborted", async () => {
    let xhrRef: MinimalXhr | null = null;
    const { factory } = fakeXhr([], 200, false);
    const handle = postChatStream(
      { message: "hi", stream: true },
      () => {},
      () => {
        const xhr = factory();
        xhrRef = xhr;
        return xhr;
      },
    );
    handle.cancel();
    assert.equal(xhrRef !== null, true);
    await assert.rejects(handle.done, { code: "cancelled" });
  });
});
