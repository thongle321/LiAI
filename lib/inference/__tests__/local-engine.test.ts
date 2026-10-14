const assert: any = {
  ok: (v: unknown, msg?: string) => expect(v).toBeTruthy(),
  equal: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  strictEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toBe(b),
  notEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  notDeepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  match: (value: string, re: RegExp | string, msg?: string) => expect(value).toMatch(re as any),
  doesNotMatch: (value: string, re: RegExp | string, msg?: string) => expect(value).not.toMatch(re as any),
  throws: (fn: () => void, re?: RegExp | string, msg?: string) => expect(fn).toThrow(re as any),
  doesNotThrow: (fn: () => void, msg?: string) => expect(fn).not.toThrow(),
  rejects: async (input: any, expected?: any, msg?: string) => {
    const p = typeof input === "function" ? input() : input;
    let err: unknown;
    try {
      await p;
    } catch (e) {
      err = e;
    }
    if (err === undefined) {
      throw new Error("Expected promise to reject, but it resolved");
    }
    if (expected === undefined) return;
    if (typeof expected === "function") {
      if (expected.prototype) {
        if (!(err instanceof expected)) {
          throw new Error(msg ?? "rejected value not instance of expected constructor");
        }
      } else if (!expected(err)) {
        throw new Error(msg ?? "rejected value did not satisfy validator");
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String((err as Error)?.message ?? err))) {
        throw new Error(msg ?? "rejected message did not match");
      }
    } else if (typeof expected === "string") {
      if (!String((err as Error)?.message ?? err).includes(expected)) {
        throw new Error(msg ?? "rejected message did not include expected text");
      }
    } else if (expected instanceof Error) {
      if (((err as Error)?.message ?? String(err)) !== expected.message) {
        throw new Error(msg ?? "rejected message did not match");
      }
    }
  },
};

/** Local llama engine: thin wrapper over a llama.rn context (TDD).
 * Run: node --test frontend/tests/local-engine.test.ts */


import {
  buildInitParams,
  createLocalEngine,
  releaseLocalEngine,
  type LlamaCompletionParams,
  type LlamaContextLike,
  type LlamaTokenData,
} from "../local-engine";
import { DEFAULT_SAMPLER } from "../sampler";

function fakeContext(
  over: Partial<LlamaContextLike> = {},
): LlamaContextLike & { stopped: boolean; released: boolean } {
  const ctx: LlamaContextLike & { stopped: boolean; released: boolean } = {
    stopped: false,
    released: false,
    completion: async (_params, onToken) => {
      onToken?.({ content: "he", token: "he" });
      onToken?.({ content: "llo", token: "llo" });
      return {
        text: "hello",
        content: "hello",
        tool_calls: [],
        tokens_predicted: 2,
        tokens_evaluated: 5,
      };
    },
    stopCompletion: async () => {
      ctx.stopped = true;
    },
    release: async () => {
      ctx.released = true;
    },
  };
  return Object.assign(ctx, over);
}

describe("createLocalEngine", () => {
  it("streams content deltas and maps usage", async () => {
    const engine = createLocalEngine(fakeContext());
    const tokens: string[] = [];
    const out = await engine.completion(
      { messages: [{ role: "user", content: "hi" }] },
      { onToken: (t) => tokens.push(t) },
    );
    assert.deepEqual(tokens, ["he", "llo"]);
    assert.equal(out.text, "hello");
    assert.equal(out.promptTokens, 5);
    assert.equal(out.completionTokens, 2);
    assert.deepEqual(out.toolCalls, []);
  });

  it("projects native tool calls with fallback ids", async () => {
    const ctx = fakeContext({
      completion: async (_params: LlamaCompletionParams, _onToken?: (data: LlamaTokenData) => void) => ({
        text: "",
        content: "",
        tool_calls: [
          { type: "function", function: { name: "calculate", arguments: "{}" } },
          {
            id: "c9",
            type: "function",
            function: { name: "datetime", arguments: "{}" },
          },
        ],
        tokens_predicted: 1,
        tokens_evaluated: 1,
      }),
    });
    const engine = createLocalEngine(ctx);
    const out = await engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    assert.equal(out.toolCalls.length, 2);
    assert.equal(out.toolCalls[0].name, "calculate");
    assert.ok(out.toolCalls[0].id.length > 0);
    assert.equal(out.toolCalls[1].id, "c9");
  });

  it("forwards enableThinking as enable_thinking, omits when unset", async () => {
    const seen: LlamaCompletionParams[] = [];
    const ctx = fakeContext({
      completion: async (params: LlamaCompletionParams) => {
        seen.push(params);
        return { text: "t", content: "t", tool_calls: [], tokens_predicted: 1, tokens_evaluated: 1 };
      },
    });
    const engine = createLocalEngine(ctx);
    await engine.completion(
      { messages: [{ role: "user", content: "x" }], enableThinking: false },
      { onToken: () => {} },
    );
    await engine.completion({ messages: [{ role: "user", content: "y" }] }, { onToken: () => {} });
    assert.equal(seen[0].enable_thinking, false);
    assert.equal("enable_thinking" in seen[1], false);
  });

  it("forwards the sampler flat, as llama.rn's sibling keys", async () => {
    const seen: LlamaCompletionParams[] = [];
    const ctx = fakeContext({
      completion: async (params: LlamaCompletionParams) => {
        seen.push(params);
        return { text: "t", content: "t", tool_calls: [], tokens_predicted: 1, tokens_evaluated: 1 };
      },
    });
    const engine = createLocalEngine(ctx);
    await engine.completion(
      {
        messages: [{ role: "user", content: "x" }],
        sampler: { ...DEFAULT_SAMPLER, temperature: 0.15, penaltyFrequency: 1.5 },
      },
      { onToken: () => {} },
    );
    await engine.completion({ messages: [{ role: "user", content: "y" }] }, { onToken: () => {} });
    // Top level, or the native converter drops them: the first version of
    // this nested them under `sampler:`, passed every check, and did nothing.
    assert.equal(seen[0].temperature, 0.15);
    assert.equal(seen[0].penalty_freq, 1.5, "not penalty_frequency");
    assert.equal("sampler" in seen[0], false, "nothing is nested under a sampler key");
    assert.equal("temperature" in seen[1], false, "an absent sampler stays absent");
  });

  it("builds init params, omitting what is not in play", () => {
    // Pure, so the conditional parts are testable without the native import.
    const base = {
      n_ctx: 4096,
      n_gpu_layers: 99,
      use_mlock: false,
      use_mmap: true,
      n_batch: 512,
      n_ubatch: 512,
      n_threads: 4,
      flash_attn_type: "auto" as const,
      cache_type_k: "q8_0" as const,
      cache_type_v: "q8_0" as const,
      speculative: false,
      spec_draft_n_gpu_layers: 99,
      spec_draft_cache_type_k: "q8_0" as const,
      spec_draft_cache_type_v: "q8_0" as const,
      no_extra_bufts: true,
    };

    // Omitted, not []: llama.rn reads a missing `devices` as "use the
    // platform default", and an empty array is a different instruction.
    assert.equal("devices" in buildInitParams(base), false);
    assert.deepEqual(buildInitParams({ ...base, devices: ["HTP*"] }).devices, ["HTP*"]);

    // Weight repacking is the inverse of the flag llama.cpp wants.
    assert.equal(buildInitParams(base).no_extra_bufts, true);
    assert.equal(buildInitParams({ ...base, no_extra_bufts: false }).no_extra_bufts, false);

    assert.equal("model_draft" in buildInitParams(base), false);
    assert.equal(
      buildInitParams({ ...base, model_draft: "/models/small.gguf" }).model_draft,
      "/models/small.gguf",
    );

    // The speculative sub-block is conditional on the switch above it.
    assert.equal("spec_draft_n_gpu_layers" in buildInitParams(base), false);
    assert.equal(
      buildInitParams({ ...base, speculative: true }).spec_draft_n_gpu_layers,
      99,
    );
  });

  it("forwards stop and release to the native context", async () => {
    const ctx = fakeContext();
    const engine = createLocalEngine(ctx);
    await engine.stopCompletion();
    assert.equal(ctx.stopped, true);
    await releaseLocalEngine(ctx);
    assert.equal(ctx.released, true);
  });

  it("surfaces native failures as errors", async () => {
    const ctx = fakeContext({
      completion: async () => {
        throw new Error("context_was_released");
      },
    });
    const engine = createLocalEngine(ctx);
    await assert.rejects(
      engine.completion({ messages: [{ role: "user", content: "x" }] }, { onToken: () => {} }),
      /context_was_released/,
    );
  });
});

describe("prompt occupancy (C3)", () => {
  /** A completion whose result carries the given extra fields. */
  const occupancy = async (extra: Record<string, unknown>) =>
    createLocalEngine(
      fakeContext({
        completion: async () => ({
          text: "hi",
          content: "hi",
          tool_calls: [],
          tokens_predicted: 1,
          tokens_evaluated: 1000,
          ...extra,
        }),
      }),
    ).completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );

  it("counts every token held against the window, not only re-processed ones", async () => {
    // tokens_cached = n_past at completion end: prompt (reused AND
    // re-processed) plus generated, post any context shift — what the
    // fill meter actually divides by nCtx.
    const out = await occupancy({ tokens_cached: 1200 });
    assert.equal(out.promptTokens, 1200);
  });

  it("falls back to the prompt total when the build omits the key", async () => {
    const out = await occupancy({});
    assert.equal(out.promptTokens, 1000);
  });

  it("treats a reported 0 as a fact, never as absence", async () => {
    // PocketPal's distinction: "old build omits the key" and "cold
    // reports 0" are different facts — only the omission falls back.
    const out = await occupancy({ tokens_cached: 0 });
    assert.equal(out.promptTokens, 0);
  });
});

describe("completion stop signals (G1/G4)", () => {
  /** A completion whose result carries the given stop fields. */
  function ctxWith(stop: Record<string, unknown>) {
    return fakeContext({
      completion: async () => ({
        text: "hi",
        content: "hi",
        tool_calls: [],
        tokens_predicted: 2,
        tokens_evaluated: 5,
        ...stop,
      }),
    });
  }

  const run = async (stop: Record<string, unknown>) =>
    createLocalEngine(ctxWith(stop)).completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );

  it("reports context_full straight from the native result", async () => {
    // No string-matching a thrown message: llama.rn hands us the flag.
    const out = await run({ context_full: true });
    assert.equal(out.contextFull, true);
  });

  it("reports truncated, which is a second way to fill the context", async () => {
    const out = await run({ truncated: true });
    assert.equal(out.contextFull, true);
  });

  it("reports a normal finish as neither full nor cut off", async () => {
    const out = await run({ context_full: false, truncated: false, interrupted: false });
    assert.equal(out.contextFull, false);
    assert.equal(out.interrupted, false);
    assert.equal(out.stoppedEarly, false);
  });

  it("reports interrupted, so a stopped reply is not a finished one", async () => {
    const out = await run({ interrupted: true });
    assert.equal(out.interrupted, true);
  });

  it("makes stoppedEarly real instead of hardcoded false", async () => {
    // This field was `false` on every completion for the life of the
    // type. A stopped_limit above zero means the sampler hit n_predict.
    const out = await run({ stopped_limit: 1 });
    assert.equal(out.stoppedEarly, true);
    assert.equal((await run({ stopped_limit: 0 })).stoppedEarly, false);
  });

  it("treats an absent stop field as not stopped, not as a crash", async () => {
    // Older/dev builds may omit the field entirely; the banner must
    // simply not appear rather than the turn failing.
    const out = await run({});
    assert.equal(out.contextFull, false);
    assert.equal(out.interrupted, false);
    assert.equal(out.stoppedEarly, false);
  });

  it("projects timings for the turn footer", async () => {
    const out = await run({
      timings: {
        prompt_ms: 120,
        predicted_per_second: 25,
        predicted_per_token_ms: 40,
        prompt_n: 5,
        predicted_n: 2,
      },
    });
    assert.equal(out.timings?.promptMs, 120);
    assert.equal(out.timings?.tokensPerSecond, 25);
    assert.equal(out.timings?.msPerToken, 40);
  });

  it("projects prompt throughput for the footer, when the engine reports it", async () => {
    const out = await run({
      timings: { prompt_ms: 120, prompt_per_second: 640.5, prompt_n: 5 },
    });
    assert.equal(out.timings?.promptTokensPerSecond, 640.5);
  });

  it("leaves prompt throughput ABSENT, not zero, when unreported", async () => {
    // "the engine did not report it" and "the engine reported zero" are
    // different facts, and only one of them should reach the footer.
    const out = await run({ timings: { prompt_ms: 120 } });
    assert.equal(out.timings?.promptTokensPerSecond, undefined);
    assert.equal(
      "promptTokensPerSecond" in (out.timings ?? {}),
      false,
      "an unreported rate must not become 0",
    );
  });

  it("keeps a REPORTED zero, so a measured zero is not mistaken for silence", async () => {
    const out = await run({ timings: { prompt_ms: 120, prompt_per_second: 0 } });
    assert.equal(out.timings?.promptTokensPerSecond, 0);
  });

  it("drops a non-finite prompt throughput rather than carrying NaN", async () => {
    const out = await run({
      timings: { prompt_ms: 120, prompt_per_second: Number.NaN },
    });
    assert.equal(out.timings?.promptTokensPerSecond, undefined);
    const inf = await run({
      timings: { prompt_ms: 120, prompt_per_second: Number.POSITIVE_INFINITY },
    });
    assert.equal(inf.timings?.promptTokensPerSecond, undefined);
  });

  it("leaves timings undefined when the engine reports none", async () => {
    const out = await run({});
    assert.equal(out.timings, undefined);
  });
});
