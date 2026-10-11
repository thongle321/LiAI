/** Direct Hub client tests: mapping, token header, error surfacing.
 * Run: node --test frontend/tests/hf-direct.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getModelFiles, hfDownloadUrl, isHuggingFaceUrl, searchModels } from "../lib/models/huggingface.ts";

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

  // The token is attached on the strength of this predicate, so a suffix
  // match hands it to whoever owns the lookalike host. These are the whole
  // reason it must be an exact match.
  it("refuses hosts that merely end in huggingface.co", () => {
    for (const url of [
      "https://evil-huggingface.co/Qwen/x/resolve/main/y.gguf",
      "https://huggingface.co.attacker.net/Qwen/x/resolve/main/y.gguf",
      "https://notreallyhuggingface.co/",
      "https://huggingface.co.evil.com/",
    ]) {
      assert.equal(isHuggingFaceUrl(url), false, `leaked the token to ${url}`);
    }
  });
});

describe("hfDownloadUrl", () => {
  it("percent-encodes each path segment but keeps the separators", () => {
    assert.equal(
      hfDownloadUrl("org/model", "Q4_K_M/my model.gguf"),
      "https://huggingface.co/org/model/resolve/main/Q4_K_M/my%20model.gguf",
    );
    assert.equal(
      hfDownloadUrl("org/model", "plain.gguf"),
      "https://huggingface.co/org/model/resolve/main/plain.gguf",
    );
  });

  it("does not double-encode a segment that is already encoded", () => {
    assert.equal(
      hfDownloadUrl("org/model", "Q4_K_M/my%20model.gguf"),
      "https://huggingface.co/org/model/resolve/main/Q4_K_M/my%20model.gguf",
    );
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
    const page = await searchModels("qwen", "tok");
    assert.ok(seen.url.startsWith("https://huggingface.co/api/models?"));
    assert.ok(seen.url.includes("search=qwen"));
    // PocketPal parity: conversational joins the gguf filter, and full/config
    // bring the row data the details header reads.
    assert.ok(seen.url.includes("filter=gguf%2Cconversational"));
    assert.ok(seen.url.includes("full=true"));
    assert.equal(seen.headers["Authorization"], "Bearer tok");
    assert.equal(seen.headers["User-Agent"], "LiAI/1.0.0");
    // No visibility filter: the Hub scopes results to what the token may
    // see, and gated rows stay downloadable via the tokened fetch.
    assert.deepEqual(
      page.results.map((r) => [r.modelId, r.author, r.name]),
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

  it("rejects non-list payloads, and an empty query still searches", async () => {
    mockFetch(async () => jsonResponse({ models: [] }));
    await assert.rejects(searchModels("qwen"), /Search failed/);
    // PocketPal parity: opening the sheet with an empty box lists the
    // Hub's default results, so the request is NOT skipped.
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      return jsonResponse([]);
    });
    const page = await searchModels("   ");
    assert.deepEqual(page.results, []);
    assert.equal(page.nextPageLink, null);
    assert.equal(calls, 1);
  });

  it("surfaces the fallback, never the raw network error", async () => {
    // The UI renders searchError verbatim, so a raw fetch message here
    // leaks "Network request failed" to the screen.
    mockFetch(async () => {
      throw new Error("Network request failed");
    });
    await assert.rejects(searchModels("qwen"), (error: Error) => {
      assert.equal(error.message, "Search failed");
      assert.doesNotMatch(error.message, /Network request failed/);
      return true;
    });
  });

  it("forwards the caller's abort signal to fetch", async () => {
    const controller = new AbortController();
    // A box, not a bare `let seen: AbortSignal | null = null`: TypeScript
    // keeps that narrowed to `null` at the assertion (it cannot see the
    // assignment happen inside the fetch mock), so `seen?.aborted` would
    // be `never` and this test would not typecheck.
    const seen: { signal: AbortSignal | null } = { signal: null };
    mockFetch(async (_url, init) => {
      seen.signal = (init?.signal as AbortSignal | undefined) ?? null;
      return jsonResponse([]);
    });
    await searchModels("qwen", undefined, controller.signal);
    assert.equal(seen.signal?.aborted, false);
    controller.abort();
    assert.equal(seen.signal?.aborted, true, "aborting the caller must abort the request");
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

it("wraps network failures as the fallback, never the raw text", async () => {
    // The UI renders this message, so the raw fetch text must not escape.
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(getModelFiles("Qwen/x"), (error: Error) => {
      assert.equal(error.message, "Failed to fetch model files");
      assert.doesNotMatch(error.message, /fetch failed/);
      return true;
    });
});
});
