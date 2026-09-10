/** Contract tests for frontend/lib/api.ts. Run: node --test frontend/tests/api.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getHealth, postChat } from "../lib/api.ts";
import type { ApiError } from "../types/api.ts";

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

describe("postChat", () => {
  it("posts message without session_id and returns reply", async () => {
    let seen: { url: string; body: string } | null = null;
    mockFetch(async (url, init) => {
      seen = {
        url: String(url),
        body: String((init?.body as string) ?? ""),
      };
      return jsonResponse({ reply: "Echo: hi", session_id: "abc" });
    });
    const res = await postChat("hi");
    assert.equal(res.reply, "Echo: hi");
    assert.equal(res.session_id, "abc");
    assert.ok(seen!.url.endsWith("/api/chat"));
    assert.deepEqual(JSON.parse(seen!.body), { message: "hi" });
  });

  it("includes session_id when continuing", async () => {
    let body = "";
    mockFetch(async (_url, init) => {
      body = String((init?.body as string) ?? "");
      return jsonResponse({ reply: "Echo: two", session_id: "abc" });
    });
    const res = await postChat("two", "abc");
    assert.equal(res.session_id, "abc");
    assert.deepEqual(JSON.parse(body), { message: "two", session_id: "abc" });
  });

  it("passes the backend error envelope through untouched", async () => {
    mockFetch(async () =>
      jsonResponse(
        { error: { code: "invalid_request", message: "nope" } },
        422,
      ),
    );
    try {
      await postChat("   ");
      assert.fail("expected throw");
    } catch (err) {
      assert.deepEqual(err, { code: "invalid_request", message: "nope" });
    }
  });

  it("maps network failure to the network code", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    try {
      await postChat("hi");
      assert.fail("expected throw");
    } catch (err) {
      assert.equal((err as ApiError).code, "network");
    }
  });

  it("maps abort to the timeout code", async () => {
    mockFetch(async (_url, init) => {
      init?.signal?.throwIfAborted();
      const err = new DOMException("aborted", "AbortError");
      throw err;
    });
    try {
      await postChat("hi");
      assert.fail("expected throw");
    } catch (err) {
      assert.equal((err as ApiError).code, "timeout");
    }
  });
});

describe("getHealth", () => {
  it("returns status on success", async () => {
    let url = "";
    mockFetch(async (u) => {
      url = String(u);
      return jsonResponse({ status: "ok" });
    });
    const res = await getHealth();
    assert.equal(res.status, "ok");
    assert.ok(url.endsWith("/health"));
  });

  it("throws not_found envelope for unknown routes", async () => {
    mockFetch(async () =>
      jsonResponse({ error: { code: "not_found", message: "x" } }, 404),
    );
    try {
      await getHealth();
      assert.fail("expected throw");
    } catch (err) {
      assert.equal((err as ApiError).code, "not_found");
    }
  });
});
