/** Direct Hub client tests: mapping, token header, error surfacing.
 * Run: node --test frontend/tests/hf-direct.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getModelFiles, isHuggingFaceUrl, searchModels } from "../lib/models/huggingface.ts";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  (globalThis as Record<string, unknown>).fetch = impl;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("isHuggingFaceUrl", () => {
  it("matches huggingface.co hosts only", () => {
    assert.equal(isHuggingFaceUrl("https://huggingface.co/Qwen/x/resolve/main/y.gguf"), true);
    assert.equal(isHuggingFaceUrl("https://example.com/model.gguf"), false);
    assert.equal(isHuggingFaceUrl("not a url"), false);
  });
});

describe("hub search", () => {
  beforeEach(() => {
    mockFetch(async () => jsonResponse([]));
  });

  it("maps Hub results and forwards the token as Bearer", async () => {
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
    assert.ok(seen.url.startsWith("https://huggingface.co/api/models?"));
    assert.ok(seen.url.includes("search=qwen"));
    assert.ok(seen.url.includes("filter=gguf"));
    assert.equal(seen.headers["Authorization"], "Bearer tok");
    assert.equal(seen.headers["User-Agent"], "LiAI");
    // No visibility filter: the Hub scopes results to what the token may
    // see, and gated rows stay downloadable via the tokened fetch.
    assert.deepEqual(
      results.map((r) => [r.modelId, r.author, r.name]),
      [
        ["Qwen/Qwen2.5-0.5B", "Qwen", "Qwen2.5-0.5B"],
        ["corp/gated", "corp", "gated"],
      ],
    );
  });

  it("omits the auth header when no token is set", async () => {
    let headers: Record<string, string> = {};
    mockFetch(async (_url, init) => {
      headers = { ...(init?.headers as Record<string, string>) };
      return jsonResponse([]);
    });
    await searchModels("qwen");
    assert.ok(!("Authorization" in headers));
  });

  it("maps 401/403 to the token hint", async () => {
    mockFetch(async () => jsonResponse({ message: "unauthorized" }, 401));
    await assert.rejects(searchModels("qwen", "bad"), /check your Hugging Face token/);
  });

  it("rejects non-list payloads and blanks without fetching", async () => {
    mockFetch(async () => jsonResponse({ models: [] }));
    await assert.rejects(searchModels("qwen"), /Search failed/);
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      return jsonResponse([]);
    });
    assert.deepEqual(await searchModels("   "), []);
    assert.equal(calls, 0);
  });
});

describe("hub files", () => {
  beforeEach(() => {
    mockFetch(async () => jsonResponse([]));
  });

  it("maps gguf tree entries to files", async () => {
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
    assert.ok(seen.includes("https://huggingface.co/api/models/Qwen/x/tree/main"));
    assert.deepEqual(
      files.map((f) => [f.name, f.size]),
      [["m-Q4_K_M.gguf", 10]],
    );
  });

  it("wraps network failures as Errors", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(getModelFiles("Qwen/x"), /fetch failed/);
  });
});
