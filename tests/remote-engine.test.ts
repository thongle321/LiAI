/** Remote BYOK engine: OpenAI-compatible completion (TDD).
 * Run: node --test frontend/tests/remote-engine.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createRemoteEngine,
  normalizeTimeoutMs,
} from "../lib/inference/remote-engine.ts";
import type { RemoteApiProvider } from "../types/models.ts";

function provider(): RemoteApiProvider {
  return {
    id: "api-1",
    name: "Mine",
    providerType: "custom_openai",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    modelName: "qwen",
    isActive: false,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createRemoteEngine", () => {
  it("posts chat completions and emits the reply as one token", async () => {
    const seen: { url: string; body: string; headers: Record<string, string> } = {
      url: "",
      body: "",
      headers: {},
    };
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.url = String(url);
      seen.body = String(init?.body ?? "");
      seen.headers = { ...((init?.headers as Record<string, string>) ?? {}) };
      return jsonResponse({
        choices: [{ message: { content: "hello there", tool_calls: [] } }],
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      });
    }) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "sk-key", {
      fetchImpl,
    });
    const tokens: string[] = [];
    const out = await engine.completion(
      { messages: [{ role: "user", content: "hi" }] },
      { onToken: (t) => tokens.push(t) },
    );
    assert.ok(seen.url.endsWith("/v1/chat/completions"));
    assert.equal(seen.headers["Authorization"], "Bearer sk-key");
    assert.equal(JSON.parse(seen.body).model, "qwen");
    assert.deepEqual(tokens, ["hello there"]);
    assert.equal(out.text, "hello there");
    assert.equal(out.promptTokens, 4);
    assert.equal(out.completionTokens, 2);
  });

  it("projects message tool_calls to engine calls with fallback ids", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                { id: "c1", function: { name: "calculate", arguments: '{"a":1}' } },
                { function: { name: "datetime", arguments: "{}" } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    const out = await engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    assert.equal(out.toolCalls.length, 2);
    assert.equal(out.toolCalls[0].id, "c1");
    assert.equal(out.toolCalls[0].name, "calculate");
    assert.equal(out.toolCalls[1].name, "datetime");
    assert.ok(out.toolCalls[1].id.length > 0);
  });

  it("marks a length-capped remote turn as stopped, but NOT context-full", async () => {
    // `finish_reason: "length"` could be the model's context window or a
    // server max_tokens; an OpenAI-compatible endpoint does not say which.
    // Claiming "context full" would put a wrong banner in front of the user.
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [{ message: { content: "cut off", tool_calls: [] }, finish_reason: "length" }],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
      })) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    const out = await engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    assert.equal(out.stoppedEarly, true);
    assert.equal(out.contextFull, false);
    assert.equal(out.interrupted, false);
    // No invented timings: the endpoint reported none.
    assert.equal(out.timings, undefined);
  });

  it("leaves a normally-finished remote turn unflagged", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [{ message: { content: "done", tool_calls: [] }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    const out = await engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    assert.equal(out.stoppedEarly, false);
    assert.equal(out.contextFull, false);
  });

  it("survives a payload with no finish_reason at all", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [{ message: { content: "done", tool_calls: [] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    const out = await engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    assert.equal(out.stoppedEarly, false);
  });

  it("rejects a missing key before touching the network", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({});
    }) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => null, { fetchImpl });
    await assert.rejects(
      engine.completion({ messages: [{ role: "user", content: "x" }] }, { onToken: () => {} }),
      /key is required/,
    );
    assert.equal(calls, 0);
  });

  it("maps HTTP failures to errors", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: "nope" }, 401)) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    await assert.rejects(
      engine.completion({ messages: [{ role: "user", content: "x" }] }, { onToken: () => {} }),
      /401/,
    );
  });

  it("stopCompletion aborts the in-flight request", async () => {
    let observed: AbortSignal | null = null;
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      observed = (init?.signal ?? null) as AbortSignal | null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    const pending = engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    // Let the async key lookup settle so the fetch is in flight first.
    await new Promise((r) => setTimeout(r, 10));
    await engine.stopCompletion();
    assert.ok(observed !== null && (observed as AbortSignal).aborted);
    await assert.rejects(pending, /abort|cancel/i);
  });
});

describe("request timeout", () => {
  /** A fetch that hangs until its signal aborts, capturing the signal. */
  function hangingFetch(): {
    fetchImpl: typeof fetch;
    signal: () => AbortSignal | null;
  } {
    let observed: AbortSignal | null = null;
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      observed = (init?.signal ?? null) as AbortSignal | null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as typeof fetch;
    return { fetchImpl, signal: () => observed };
  }

  it("the injected value reaches the abort timer", async () => {
    const { fetchImpl, signal } = hangingFetch();
    const engine = createRemoteEngine(provider(), async () => "k", {
      fetchImpl,
      timeoutMs: 60,
    });
    const started = Date.now();
    const pending = engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    await assert.rejects(pending, /abort/i);
    const elapsed = Date.now() - started;
    // Fires (not the 120s default) and not instantly (not zero/negative):
    // the injected 60ms is what armed the timer.
    assert.ok(elapsed >= 30, `aborted too early: ${elapsed}ms`);
    assert.ok(elapsed < 5000, `aborted too late: ${elapsed}ms`);
    assert.ok(signal()?.aborted);
  });

  it("a completed turn is unaffected by the timer", async () => {
    let observed: AbortSignal | null = null;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      observed = (init?.signal ?? null) as AbortSignal | null;
      await new Promise((r) => setTimeout(r, 10));
      return jsonResponse({
        choices: [{ message: { content: "ok", tool_calls: [] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", {
      fetchImpl,
      timeoutMs: 40,
    });
    const out = await engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    assert.equal(out.text, "ok");
    // The finally clears the timer; nothing aborts a finished turn.
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(observed !== null && !(observed as AbortSignal).aborted);
  });

  it("falls back to the default when the value is non-positive or non-finite", async () => {
    const { fetchImpl, signal } = hangingFetch();
    const engine = createRemoteEngine(provider(), async () => "k", {
      fetchImpl,
      timeoutMs: 0,
    });
    const pending = engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    // A zero timeout would abort instantly; the default (120s) must win.
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(signal() !== null && !signal()!.aborted);
    await engine.stopCompletion();
    await assert.rejects(pending, /abort/i);
  });

  it("normalizeTimeoutMs is the one rule: finite and positive, else unset", () => {
    assert.equal(normalizeTimeoutMs(120_000), 120_000);
    assert.equal(normalizeTimeoutMs(undefined), undefined);
    assert.equal(normalizeTimeoutMs(0), undefined);
    assert.equal(normalizeTimeoutMs(-1), undefined);
    assert.equal(normalizeTimeoutMs(NaN), undefined);
    assert.equal(normalizeTimeoutMs(Infinity), undefined);
    assert.equal(normalizeTimeoutMs("120000"), undefined);
    assert.equal(normalizeTimeoutMs(null), undefined);
  });
});

describe("timeout wiring", () => {
  it("the store passes the stored provider timeout into the engine options", () => {
    // The seam is RemoteEngineOptions.timeoutMs; without this line the
    // stored value never reaches the abort timer.
    const source = readFileSync(
      path.join(import.meta.dirname, "..", "store/chat/index.ts"),
      "utf8",
    );
    assert.match(
      source,
      /createRemoteEngine\(\s*provider,\s*getKey,\s*\{\s*timeoutMs:\s*provider\.timeoutMs\s*\}\s*\)/,
      "createRemote must forward provider.timeoutMs to the engine",
    );
  });
});
