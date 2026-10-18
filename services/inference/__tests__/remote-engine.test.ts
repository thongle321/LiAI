
/** Remote BYOK engine: OpenAI-compatible completion. */

import { readSource } from "@/jest/source";

import {
  createRemoteEngine,
  normalizeTimeoutMs,
} from "../remote-engine";
import type { RemoteApiProvider } from "@/types/models";

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
    expect(seen.url.endsWith("/v1/chat/completions")).toBeTruthy();
    expect(seen.headers["Authorization"]).toEqual("Bearer sk-key");
    expect(JSON.parse(seen.body).model).toEqual("qwen");
    expect(tokens).toEqual(["hello there"]);
    expect(out.text).toEqual("hello there");
    expect(out.promptTokens).toEqual(4);
    expect(out.completionTokens).toEqual(2);
  });

  it("sends reasoning effort per provider family, and nothing without an override", async () => {
    // Parity with PocketPal's bodyExtras: llama-server has NO top-level
    // reasoning_effort (the kwarg is its path); OpenRouter wants it
    // top-level. Neither key may ride along when the user chose nothing.
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return jsonResponse({ choices: [{ message: { content: "ok", tool_calls: [] } }] });
    }) as typeof fetch;
    const noop = { onToken: () => {} };

    const custom = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    await custom.completion(
      { messages: [{ role: "user", content: "hi" }], reasoningEffort: "high" },
      noop,
    );
    expect((bodies[0] as Record<string, unknown>)["chat_template_kwargs"]).toEqual({ reasoning_effort: "high" });

    const openrouter = createRemoteEngine(
      { ...provider(), providerType: "openrouter" },
      async () => "k",
      { fetchImpl },
    );
    await openrouter.completion(
      { messages: [{ role: "user", content: "hi" }], reasoningEffort: "low" },
      noop,
    );
    expect((bodies[1] as Record<string, unknown>)["reasoning_effort"]).toEqual("low");
    expect("chat_template_kwargs" in (bodies[1] as object)).toEqual(false);

    await custom.completion({ messages: [{ role: "user", content: "hi" }] }, noop);
    const none = bodies[2] as Record<string, unknown>;
    expect("reasoning_effort" in none).toEqual(false);
    expect("chat_template_kwargs" in none).toEqual(false);
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
    expect(out.toolCalls.length).toEqual(2);
    expect(out.toolCalls[0].id).toEqual("c1");
    expect(out.toolCalls[0].name).toEqual("calculate");
    expect(out.toolCalls[1].name).toEqual("datetime");
    expect(out.toolCalls[1].id.length > 0).toBeTruthy();
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
    expect(out.stoppedEarly).toEqual(true);
    expect(out.contextFull).toEqual(false);
    expect(out.interrupted).toEqual(false);
    // No invented timings: the endpoint reported none.
    expect(out.timings).toEqual(undefined);
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
    expect(out.stoppedEarly).toEqual(false);
    expect(out.contextFull).toEqual(false);
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
    expect(out.stoppedEarly).toEqual(false);
  });

  it("rejects a missing key before touching the network", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({});
    }) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => null, { fetchImpl });
    await expect(engine.completion({ messages: [{ role: "user", content: "x" }] }, { onToken: () => {} })).rejects.toThrow(/key is required/);
    expect(calls).toEqual(0);
  });

  it("maps HTTP failures to errors", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: "nope" }, 401)) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    await expect(engine.completion({ messages: [{ role: "user", content: "x" }] }, { onToken: () => {} })).rejects.toThrow(/401/);
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
    expect(observed !== null && (observed as AbortSignal).aborted).toBeTruthy();
    await expect(pending).rejects.toThrow(/abort|cancel/i);
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
    await expect(pending).rejects.toThrow(/abort/i);
    const elapsed = Date.now() - started;
    // Fires (not the 120s default) and not instantly (not zero/negative):
    // the injected 60ms is what armed the timer.
    expect(elapsed >= 30).toBeTruthy();
    expect(elapsed < 5000).toBeTruthy();
    expect(signal()?.aborted).toBeTruthy();
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
    expect(out.text).toEqual("ok");
    // The finally clears the timer; nothing aborts a finished turn.
    await new Promise((r) => setTimeout(r, 60));
    expect(observed !== null && !(observed as AbortSignal).aborted).toBeTruthy();
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
    expect(signal() !== null && !signal()!.aborted).toBeTruthy();
    await engine.stopCompletion();
    await expect(pending).rejects.toThrow(/abort/i);
  });

  it("normalizeTimeoutMs is the one rule: finite and positive, else unset", () => {
    expect(normalizeTimeoutMs(120_000)).toEqual(120_000);
    expect(normalizeTimeoutMs(undefined)).toEqual(undefined);
    expect(normalizeTimeoutMs(0)).toEqual(undefined);
    expect(normalizeTimeoutMs(-1)).toEqual(undefined);
    expect(normalizeTimeoutMs(NaN)).toEqual(undefined);
    expect(normalizeTimeoutMs(Infinity)).toEqual(undefined);
    expect(normalizeTimeoutMs("120000")).toEqual(undefined);
    expect(normalizeTimeoutMs(null)).toEqual(undefined);
  });
});

describe("remote prompt occupancy (C3)", () => {
  const occupancy = async (usage: unknown) => {
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [{ message: { content: "ok", tool_calls: [] } }],
        ...(usage !== undefined ? { usage } : {}),
      })) as typeof fetch;
    const engine = createRemoteEngine(provider(), async () => "k", { fetchImpl });
    return engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
  };

  it("prompt_tokens already includes the cached subset — never add it twice", async () => {
    // OpenAI's contract: prompt_tokens_details.cached_tokens is a
    // breakdown OF prompt_tokens, not a remainder to sum in.
    const out = await occupancy({
      prompt_tokens: 10,
      prompt_tokens_details: { cached_tokens: 4 },
    });
    expect(out.promptTokens).toEqual(10);
  });

  it("reads cached_tokens on its own when the server omits prompt_tokens", async () => {
    // Each key guarded independently: absence of the total is not a
    // licence to invent zero when the subset is right there.
    const out = await occupancy({
      prompt_tokens_details: { cached_tokens: 4 },
    });
    expect(out.promptTokens).toEqual(4);
  });
});

describe("timeout wiring", () => {
  it("the store passes the stored provider timeout into the engine options", () => {
    // The seam is RemoteEngineOptions.timeoutMs; without this line the
    // stored value never reaches the abort timer.
    const source = readSource(
      "store/chat/index.ts",
    );
    expect(source).toMatch(/createRemoteEngine\(\s*provider,\s*getKey,\s*\{\s*timeoutMs:\s*provider\.timeoutMs\s*\}\s*\)/);
  });
});
