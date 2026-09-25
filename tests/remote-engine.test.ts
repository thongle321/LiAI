/** Remote BYOK engine: OpenAI-compatible completion (TDD).
 * Run: node --test frontend/tests/remote-engine.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createRemoteEngine } from "../lib/inference/remote-engine.ts";
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
