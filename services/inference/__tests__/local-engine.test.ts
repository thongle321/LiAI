
/** Local llama engine: thin wrapper over a llama.rn context. */


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
    expect(tokens).toEqual(["he", "llo"]);
    expect(out.text).toEqual("hello");
    expect(out.promptTokens).toEqual(5);
    expect(out.completionTokens).toEqual(2);
    expect(out.toolCalls).toEqual([]);
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
    expect(out.toolCalls.length).toEqual(2);
    expect(out.toolCalls[0].name).toEqual("calculate");
    expect(out.toolCalls[0].id.length > 0).toBeTruthy();
    expect(out.toolCalls[1].id).toEqual("c9");
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
    expect(seen[0].enable_thinking).toEqual(false);
    expect("enable_thinking" in seen[1]).toEqual(false);
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
    expect(seen[0].temperature).toEqual(0.15);
    expect(seen[0].penalty_freq).toEqual(1.5);
    expect("sampler" in seen[0]).toEqual(false);
    expect("temperature" in seen[1]).toEqual(false);
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
    expect("devices" in buildInitParams(base)).toEqual(false);
    expect(buildInitParams({ ...base, devices: ["HTP*"] }).devices).toEqual(["HTP*"]);

    // Weight repacking is the inverse of the flag llama.cpp wants.
    expect(buildInitParams(base).no_extra_bufts).toEqual(true);
    expect(buildInitParams({ ...base, no_extra_bufts: false }).no_extra_bufts).toEqual(false);

    expect("model_draft" in buildInitParams(base)).toEqual(false);
    expect(buildInitParams({ ...base, model_draft: "/models/small.gguf" }).model_draft).toEqual("/models/small.gguf");

    // The speculative sub-block is conditional on the switch above it.
    expect("spec_draft_n_gpu_layers" in buildInitParams(base)).toEqual(false);
    expect(buildInitParams({ ...base, speculative: true }).spec_draft_n_gpu_layers).toEqual(99);
  });

  it("forwards stop and release to the native context", async () => {
    const ctx = fakeContext();
    const engine = createLocalEngine(ctx);
    await engine.stopCompletion();
    expect(ctx.stopped).toEqual(true);
    await releaseLocalEngine(ctx);
    expect(ctx.released).toEqual(true);
  });

  it("surfaces native failures as errors", async () => {
    const ctx = fakeContext({
      completion: async () => {
        throw new Error("context_was_released");
      },
    });
    const engine = createLocalEngine(ctx);
    await expect(engine.completion({ messages: [{ role: "user", content: "x" }] }, { onToken: () => {} })).rejects.toThrow(/context_was_released/);
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
    expect(out.promptTokens).toEqual(1200);
  });

  it("falls back to the prompt total when the build omits the key", async () => {
    const out = await occupancy({});
    expect(out.promptTokens).toEqual(1000);
  });

  it("treats a reported 0 as a fact, never as absence", async () => {
    // PocketPal's distinction: "old build omits the key" and "cold
    // reports 0" are different facts — only the omission falls back.
    const out = await occupancy({ tokens_cached: 0 });
    expect(out.promptTokens).toEqual(0);
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
    expect(out.contextFull).toEqual(true);
  });

  it("reports truncated, which is a second way to fill the context", async () => {
    const out = await run({ truncated: true });
    expect(out.contextFull).toEqual(true);
  });

  it("reports a normal finish as neither full nor cut off", async () => {
    const out = await run({ context_full: false, truncated: false, interrupted: false });
    expect(out.contextFull).toEqual(false);
    expect(out.interrupted).toEqual(false);
    expect(out.stoppedEarly).toEqual(false);
  });

  it("reports interrupted, so a stopped reply is not a finished one", async () => {
    const out = await run({ interrupted: true });
    expect(out.interrupted).toEqual(true);
  });

  it("makes stoppedEarly real instead of hardcoded false", async () => {
    // This field was `false` on every completion for the life of the
    // type. A stopped_limit above zero means the sampler hit n_predict.
    const out = await run({ stopped_limit: 1 });
    expect(out.stoppedEarly).toEqual(true);
    expect((await run({ stopped_limit: 0 })).stoppedEarly).toEqual(false);
  });

  it("treats an absent stop field as not stopped, not as a crash", async () => {
    // Older/dev builds may omit the field entirely; the banner must
    // simply not appear rather than the turn failing.
    const out = await run({});
    expect(out.contextFull).toEqual(false);
    expect(out.interrupted).toEqual(false);
    expect(out.stoppedEarly).toEqual(false);
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
    expect(out.timings?.promptMs).toEqual(120);
    expect(out.timings?.tokensPerSecond).toEqual(25);
    expect(out.timings?.msPerToken).toEqual(40);
  });

  it("never surfaces prompt throughput on LOCAL turns (PocketPal origin gate)", async () => {
    // PocketPal's AssistantTurnFooter comment: llama.rn reports
    // prompt_per_second on local turns, "so origin gates them rather than
    // presence". The whole footer row is a status line the reader skims —
    // a local turn prints ms/token, tokens/sec, TTFT (matches the
    // reported target layout), and the prompt rate is not part of it.
    // Gated at the ENGINE (not the footer) because our remote engine
    // reports no timings at all: a timings key that would present here
    // could only ever come from a remote engine's own projection, so an
    // origin gate and a presence gate are the same rule already.
    const out = await run({
      timings: { prompt_ms: 120, prompt_per_second: 640.5, prompt_n: 5 },
    });
    expect(out.timings?.promptTokensPerSecond).toEqual(undefined);
    expect("promptTokensPerSecond" in (out.timings ?? {})).toEqual(false);

    const zero = await run({
      timings: { prompt_ms: 120, prompt_per_second: 0 },
    });
    expect(zero.timings?.promptTokensPerSecond).toEqual(undefined);

    const nan = await run({
      timings: { prompt_ms: 120, prompt_per_second: Number.NaN },
    });
    const inf = await run({
      timings: { prompt_ms: 120, prompt_per_second: Number.POSITIVE_INFINITY },
    });
    expect(nan.timings?.promptTokensPerSecond).toEqual(undefined);
    expect(inf.timings?.promptTokensPerSecond).toEqual(undefined);
  });

  it("leaves timings undefined when the engine reports none", async () => {
    const out = await run({});
    expect(out.timings).toEqual(undefined);
  });
});
