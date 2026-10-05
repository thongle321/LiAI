/** Remote caps probe (C7): /props, its guards, and the field-wise merge.
 *
 * The probe is the set's only live network request, so the seam is the
 * pure function with an injected fetch: every failure mode must resolve
 * to NO FIELDS (unknown), never to "unsupported" — a probe can never
 * blank a capability the store already knows.
 *
 * Run: node --test tests/remote-caps.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mergeRemoteCaps,
  probeRemoteCaps,
  stripMeasuredCaps,
} from "../lib/models/remote-api.ts";
import type { RemoteApiProvider, RemoteCaps } from "../types/models.ts";

function provider(over: Partial<RemoteApiProvider> = {}): RemoteApiProvider {
  return {
    id: "api-1",
    name: "Mine",
    providerType: "custom_openai",
    baseUrl: "http://localhost:11434/",
    apiKey: "sk-real",
    modelName: "qwen",
    isActive: false,
    ...over,
  };
}

/** Capturing fake fetch returning a JSON body (or a raw Response). */
function fakeFetch(
  responder: (url: string) => Response | Promise<Response>,
): {
  fetchImpl: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    return responder(url);
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe("probeRemoteCaps", () => {
  it("captures context length and vision when the body reports them", async () => {
    const { fetchImpl, urls } = fakeFetch(() =>
      json({
        model_path: "/models/qwen.gguf",
        default_generation_settings: { n_ctx: 8192 },
        modalities: { text: true, vision: true },
      }),
    );
    const caps = await probeRemoteCaps(provider(), fetchImpl);
    assert.deepEqual(caps, { contextLength: 8192, supportsVision: true });
    // Scoped to the provider's own model: a multi-model server answers
    // per model, not for whatever it happens to list first.
    assert.ok(
      urls[0].startsWith("http://localhost:11434/props?model=qwen"),
      `probe must ask about its own model, got ${urls[0]}`,
    );
  });

  it("reads the top-level n_ctx as the older-build fallback", async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ model_path: "/m.gguf", n_ctx: 4096 }),
    );
    const caps = await probeRemoteCaps(provider(), fetchImpl);
    assert.equal(caps.contextLength, 4096);
  });

  it("discards a router placeholder that describes no loaded model", async () => {
    // Multi-model routers answer the bare form with role/router, no
    // modalities, n_ctx 0 — describing nothing. Believed, it would be
    // an unsupported-by-zero lie.
    const { fetchImpl } = fakeFetch(() =>
      json({
        model_path: "none",
        n_ctx: 0,
        default_generation_settings: {},
      }),
    );
    const caps = await probeRemoteCaps(provider(), fetchImpl);
    assert.deepEqual(caps, {});
  });

  it("resolves every failure mode to unknown, never throwing", async () => {
    const cases: Array<[string, () => Response | Promise<Response>]> = [
      ["401", () => json({ error: "nope" }, 401)],
      ["non-2xx", () => json({}, 500)],
      ["malformed body", () => new Response("not json")],
      [
        "timeout",
        () => {
          const err = new Error("timeout");
          err.name = "TimeoutError";
          return Promise.reject(err);
        },
      ],
    ];
    for (const [_label, respond] of cases) {
      const { fetchImpl } = fakeFetch(respond);
      assert.deepEqual(await probeRemoteCaps(provider(), fetchImpl), {});
    }
    // A synchronous throw from fetch itself is still just unknown.
    const throwing = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    assert.deepEqual(await probeRemoteCaps(provider(), throwing), {});
  });

  it("never claims vision is unsupported from an un-described body", async () => {
    // described model, no modalities key: unknown stays unknown.
    const { fetchImpl } = fakeFetch(() =>
      json({ model_path: "/m.gguf", n_ctx: 2048 }),
    );
    const caps = await probeRemoteCaps(provider(), fetchImpl);
    assert.equal(caps.supportsVision, undefined);
    assert.equal(caps.contextLength, 2048);
  });

  it("does not fetch where the server type has no /props", async () => {
    const { fetchImpl, urls } = fakeFetch(() => json({}));
    const caps = await probeRemoteCaps(
      provider({ providerType: "openrouter" }),
      fetchImpl,
    );
    assert.deepEqual(caps, {});
    assert.equal(urls.length, 0, "OpenRouter must not be probed");
  });
});

describe("stripMeasuredCaps", () => {
  it("keeps reachability bookkeeping, drops every measured field", () => {
    // The store uses this when the provider's identity changes (model OR
    // server): another identity's context length or vision claim must
    // never survive to be believed — while the reachability fact, which
    // is about the endpoint just answered, stays.
    assert.deepEqual(
      stripMeasuredCaps({
        reachable: true,
        checkedAt: 7,
        model: "qwen",
        contextLength: 8192,
        supportsVision: true,
      }),
      { reachable: true, checkedAt: 7 },
    );
    // A legacy record with no measured fields strips to itself.
    assert.deepEqual(
      stripMeasuredCaps({ reachable: false, checkedAt: 1 }),
      { reachable: false, checkedAt: 1 },
    );
  });
});

describe("mergeRemoteCaps", () => {
  const base: RemoteCaps = {
    reachable: true,
    checkedAt: 1,
    model: "qwen",
    contextLength: 8192,
    supportsVision: true,
  };

  it("keeps known fields when a later probe reports them absent", async () => {
    // A failed or /props-less probe must never blank what was measured.
    const merged = mergeRemoteCaps(base, {
      reachable: true,
      checkedAt: 2,
      model: "qwen",
    });
    assert.equal(merged.contextLength, 8192, "absence is not a zeroing");
    assert.equal(merged.supportsVision, true);
    assert.equal(merged.checkedAt, 2, "fresh facts still land");
  });

  it("lets a reported field win over the old value", () => {
    const merged = mergeRemoteCaps(base, {
      reachable: false,
      checkedAt: 3,
      model: "qwen",
      contextLength: 4096,
    });
    assert.equal(merged.contextLength, 4096, "reported values win");
    assert.equal(merged.supportsVision, true, "unreported still kept");
    assert.equal(merged.reachable, false);
  });

  it("starts fresh on a model switch — caps are keyed per model", () => {
    const merged = mergeRemoteCaps(base, {
      reachable: true,
      checkedAt: 4,
      model: "llama3",
      contextLength: 2048,
    });
    assert.equal(merged.contextLength, 2048, "new model's own probe");
    assert.equal(merged.supportsVision, undefined, "old model's vision never carries");
  });

  it("treats a legacy record with no model as unknown-model", () => {
    const legacy: RemoteCaps = { reachable: true, checkedAt: 0 };
    const merged = mergeRemoteCaps(legacy, {
      reachable: true,
      checkedAt: 5,
      model: "qwen",
    });
    assert.equal(merged.contextLength, undefined);
    assert.equal(merged.supportsVision, undefined);
  });
});
