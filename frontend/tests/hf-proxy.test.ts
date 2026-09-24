/** HF proxy client tests: mapping, token header, error surfacing.
 * Run: node --test frontend/tests/hf-proxy.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getModelFiles, searchModels } from "../lib/models/huggingface.ts";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  (globalThis as Record<string, unknown>).fetch = impl;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("hf proxy search", () => {
  beforeEach(() => {
    mockFetch(async () => jsonResponse([]));
  });

  it("maps proxy results and forwards the token header", async () => {
    let seen = { url: "", headers: {} as Record<string, string> };
    mockFetch(async (url, init) => {
      seen = {
        url: String(url),
        headers: { ...(init?.headers as Record<string, string>) },
      };
      return jsonResponse([
        {
          modelId: "Qwen/Qwen2.5-0.5B",
          cardData: { description: "small" },
          tags: ["gguf"],
          downloads: 10,
          likes: 2,
          private: false,
        },
        { modelId: "corp/gated", private: true },
      ]);
    });
    const results = await searchModels("qwen", "tok");
    assert.ok(seen.url.includes("/api/models/hf/search?q=qwen"));
    assert.equal(seen.headers["X-HF-Token"], "tok");
    // No visibility filter: HF scopes to what the token may see, and gated
    // rows are downloadable now that downloads carry the token.
    assert.deepEqual(
      results.map((r) => [r.modelId, r.author, r.name]),
      [
        ["Qwen/Qwen2.5-0.5B", "Qwen", "Qwen2.5-0.5B"],
        ["corp/gated", "corp", "gated"],
      ],
    );
  });

  it("omits the token header when no token is set", async () => {
    let headers: Record<string, string> = {};
    mockFetch(async (_url, init) => {
      headers = { ...(init?.headers as Record<string, string>) };
      return jsonResponse([]);
    });
    await searchModels("qwen");
    assert.ok(!("X-HF-Token" in headers));
  });

  it("surfaces backend messages as Errors", async () => {
    mockFetch(async () =>
      jsonResponse({ error: { code: "invalid_request", message: "check your Hugging Face token" } }, 400),
    );
    await assert.rejects(searchModels("qwen", "bad"), /check your Hugging Face token/);
  });

  it("rejects non-list payloads", async () => {
    mockFetch(async () => jsonResponse({ models: [] }));
    await assert.rejects(searchModels("qwen"), /Search failed/);
  });
});

describe("hf proxy files", () => {
  beforeEach(() => {
    mockFetch(async () => jsonResponse([]));
  });

  it("maps gguf tree entries through the proxy", async () => {
    let seen = "";
    mockFetch(async (url) => {
      seen = String(url);
      return jsonResponse([
        { type: "file", path: "m-Q4_K_M.gguf", size: 10 },
        { type: "file", path: "README.md", size: 3 },
        { type: "directory", path: "sub" },
      ]);
    });
    const files = await getModelFiles("Qwen/x", "tok");
    assert.ok(seen.includes("/api/models/hf/files?repo="));
    assert.deepEqual(
      files.map((f) => [f.name, f.size]),
      [["m-Q4_K_M.gguf", 10]],
    );
  });

  it("wraps network failures as Errors", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(getModelFiles("Qwen/x"), /fetch failed|Network request failed/);
  });
});
