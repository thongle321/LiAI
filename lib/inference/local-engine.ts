/** llama.rn local engine: thin native wrapper (ADR-0008).
 *
 * The context itself is injected (tests pass fakes); the default loader
 * lazy-imports llama.rn so node --test never touches the native module.
 * One native slot per engine instance — the manager owns switching.
 */

import { toLlamaSampler, type LlamaSamplerParams } from "./sampler.ts";
import type {
  CompletionCallbacks,
  CompletionEngine,
  CompletionOutcome,
  CompletionRequest,
  EngineToolCall,
} from "./engine.ts";

/** Structural slice of a llama.rn token delta we actually read. */
export interface LlamaTokenData {
  token?: string;
  content?: string;
  /** Cumulative parsed reasoning (present only with reasoning_format). */
  reasoning_content?: string;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/** Structural slice of a llama.rn completion result we actually read.
 *
 *  The stop fields were absent from this slice for the life of the type,
 *  which is why `stoppedEarly` was hardcoded false and why the chat screen
 *  had no way to notice a full context. They are all present on the real
 *  `NativeCompletionResult`
 *  (node_modules/llama.rn/lib/typescript/types.d.ts:443-485) — the slice
 *  simply never asked for them, so they were dropped on the floor. Every
 *  field stays optional: a build whose native module omits one must
 *  degrade to "no signal", never crash. */
export interface LlamaCompletionResult {
  text?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: LlamaTokenData["tool_calls"];
  tokens_predicted?: number;
  tokens_evaluated?: number;
  /** The reply did not fit the context window. */
  context_full?: boolean;
  /** Another way to run out of room, reported separately by llama.cpp. */
  truncated?: boolean;
  /** The user interrupted (Stop), as distinct from a natural finish. */
  interrupted?: boolean;
  /** >0 when the sampler stopped the turn (n_predict). */
  stopped_limit?: number;
  /** C3: llama.rn's `n_past` at completion end — every token resident
   *  in the KV cache (prompt reused + re-processed, and generated),
   *  after any context shift. See the occupancy comment in `completion`. */
  tokens_cached?: number;
  timings?: LlamaTimings;
}

/** Wall-clock figures, kept at the engine's own names; the projection to
 *  `CompletionTimings` is where our vocabulary starts. */
export interface LlamaTimings {
  prompt_ms?: number;
  predicted_ms?: number;
  predicted_per_token_ms?: number;
  predicted_per_second?: number;
  prompt_per_second?: number;
  prompt_n?: number;
  predicted_n?: number;
}

/** Params the wrapper forwards (messages/tools/media/thinking/sampler). */
export interface LlamaCompletionParams extends Partial<LlamaSamplerParams> {
  messages: Array<{
    role: string;
    content: string;
    reasoning_content?: string;
  }>;
  tools?: unknown;
  media_paths?: string[];
  enable_thinking?: boolean;
  /** Always sent as 'auto' — extracts reasoning into reasoning_content
   *  instead of leaking raw think/channel markers into the answer text. */
  reasoning_format?: "none" | "auto" | "deepseek";
  /** Flat top-level sibling like enable_thinking — never nested: llama.rn's
   *  converter drops unknown keys. */
  jinja?: boolean;
  // The sampler's 16 fields arrive as FLAT, top-level siblings here — they
  // extend from LlamaSamplerParams rather than being restated, so the names
  // are defined once. They are NOT nested under a key: llama.rn's converter
  // drops unknown keys, so nesting type-checks and then does nothing.
}

/** Structural slice of LlamaContext: completion + stop + release. */
export interface LlamaContextLike {
  completion(
    params: LlamaCompletionParams,
    onToken?: (data: LlamaTokenData) => void,
  ): Promise<LlamaCompletionResult>;
  stopCompletion(): Promise<void>;
  release(): Promise<void>;
  initMultimodal?(opts: { path: string }): Promise<boolean>;
}

function toEngineCalls(
  raw: LlamaTokenData["tool_calls"],
): EngineToolCall[] {
  if (!raw) return [];
  return raw.flatMap((tc, index) => {
    const name = tc.function?.name;
    if (!name) return [];
    return [
      {
        id: tc.id && tc.id !== "" ? tc.id : `local_${index}`,
        name,
        arguments: tc.function?.arguments ?? "{}",
      },
    ];
  });
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Wrap an (already loaded) native context as a CompletionEngine. */
export function createLocalEngine(ctx: LlamaContextLike): CompletionEngine {
  return {
    async completion(
      request: CompletionRequest,
      callbacks: CompletionCallbacks,
    ): Promise<CompletionOutcome> {
      const seen: EngineToolCall[] = [];
      // llama.rn emits ACCUMULATED content/reasoning (a parse of everything
      // so far), while our chain appends deltas — so the router tracks the
      // last seen accumulation and slices. A revision (parser retracted a
      // prefix) restarts from the new accumulation; the final result
      // replaces the bubble text anyway.
      let seenContent = "";
      let seenReasoning = "";
      const result = await ctx.completion(
        {
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.reasoning_content !== undefined && m.reasoning_content !== ""
              ? { reasoning_content: m.reasoning_content }
              : {}),
          })),
          reasoning_format: "auto",
          ...(request.tools && request.tools.length > 0
            ? { tools: request.tools }
            : {}),
          ...(request.imagePaths && request.imagePaths.length > 0
            ? { media_paths: request.imagePaths }
            : {}),
          ...(request.enableThinking !== undefined
            ? { enable_thinking: request.enableThinking }
            : {}),
          ...(request.jinja !== undefined ? { jinja: request.jinja } : {}),
          // Flat, top-level, and NOT nested under a key: llama.rn's
          // NativeCompletionParams takes these as siblings (types.d.ts), and
          // the JSI converter drops unknown keys. Nesting them under
          // `sampler:` compiles, type-checks, passes every test, and does
          // nothing at runtime.
          ...(request.sampler ? toLlamaSampler(request.sampler) : {}),
        },
        (data) => {
          const reasoning = data.reasoning_content ?? "";
          if (reasoning !== "" && reasoning !== seenReasoning) {
            seenReasoning = reasoning;
            callbacks.onReasoning?.(reasoning);
          }
          const content = data.content;
          if (content !== undefined && content !== "") {
            const delta = content.startsWith(seenContent)
              ? content.slice(seenContent.length)
              : content;
            seenContent = content;
            if (delta !== "") callbacks.onToken(delta);
          } else if (seenReasoning === "") {
            // No parser extraction at all (nothing parsed yet): raw tokens
            // ARE the answer. With reasoning present and no content field,
            // the token is thinking — it must not leak into the answer.
            const delta = data.token ?? "";
            if (delta !== "") callbacks.onToken(delta);
          }
          const calls = toEngineCalls(data.tool_calls);
          if (calls.length > 0) {
            seen.push(...calls);
            callbacks.onToolCalls?.(calls);
          }
        },
      );
      const toolCalls =
        result.tool_calls && result.tool_calls.length > 0
          ? toEngineCalls(result.tool_calls)
          : seen;
      const t = result.timings;
      const timings =
        t === undefined
          ? undefined
          : {
              promptMs: asNumber(t.prompt_ms),
              tokensPerSecond: asNumber(t.predicted_per_second),
              msPerToken: asNumber(t.predicted_per_token_ms),
            };
      // C3 — `tokens_cached` is authoritative for occupancy, by the
      // engine's own definition: it is `n_past` at completion end —
      // prompt (reused + re-processed) plus generated, after any context
      // shift, on both native paths. The timings' `cache_n` is
      // path-dependent (legacy aliases it to n_past; the slot flow sets
      // it to the reused prompt prefix only), so PocketPal's
      // `prompt_n + cache_n` — a llama-server WIRE formula — would
      // over-count on one of our paths and miss generated tokens on the
      // other; it is deliberately not read. Full trace: issue 05
      // Decision (05-cached-token-accounting.md).
      // Each key guarded on its own: a REPORTED 0 is a fact; only an
      // ABSENT key falls back to the prompt total — never to zero.
      const promptTokens =
        typeof result.tokens_cached === "number"
          ? result.tokens_cached
          : asNumber(result.tokens_evaluated);
      return {
        text: result.content ?? result.text ?? "",
        reasoning: result.reasoning_content ?? "",
        toolCalls,
        promptTokens,
        completionTokens: asNumber(result.tokens_predicted),
        // Was hardcoded `false` for the life of the type.
        stoppedEarly: asNumber(result.stopped_limit) > 0,
        // Two distinct flags mean the same thing to a reader: the window
        // ran out either way.
        contextFull: result.context_full === true || result.truncated === true,
        interrupted: result.interrupted === true,
        ...(timings !== undefined ? { timings } : {}),
      };
    },

    async stopCompletion(): Promise<void> {
      await ctx.stopCompletion();
    },
  };
}

/** Release helper for the manager's one-slot switching. */
export async function releaseLocalEngine(ctx: LlamaContextLike): Promise<void> {
  await ctx.release();
}

/** Init params forwarded to llama.rn (subset of its context options). */
export type LlamaCacheType =
  | "f16"
  | "f32"
  | "q8_0"
  | "q4_0"
  | "q4_1"
  | "iq4_nl"
  | "q5_0"
  | "q5_1";

export interface LlamaInitParams {
  n_ctx: number;
  n_gpu_layers: number;
  use_mlock: boolean;
  use_mmap: boolean;
  n_batch: number;
  n_ubatch: number;
  n_threads: number;
  flash_attn_type: "auto" | "on" | "off";
  cache_type_k: LlamaCacheType;
  cache_type_v: LlamaCacheType;
  speculative: boolean;
  spec_draft_n_gpu_layers: number;
  spec_draft_cache_type_k: LlamaCacheType;
  spec_draft_cache_type_v: LlamaCacheType;
  /** Inverted: the UI says "Enable Weight Repacking", llama.cpp wants
   *  "no extra bufts", so the store flips it and this stays dumb. */
  no_extra_bufts: boolean;
  /** Compute devices. OMITTED unless the Hexagon NPU is opted into —
   *  llama.rn reads a missing `devices` as "platform default", which is not
   *  the same instruction as an empty array. */
  devices?: string[];
  /** A separate draft GGUF for MTP-mode speculative decoding. */
  model_draft?: string;
  /** Vision budget, applied when the projector loads rather than per
   *  completion, so a change lands on the next model load. */
  image_max_tokens?: number;
}

/** Pure so the conditional parts are testable without the native import. */
export function buildInitParams(init: LlamaInitParams): Record<string, unknown> {
  return {
    n_ctx: init.n_ctx,
    n_gpu_layers: init.n_gpu_layers,
    use_mlock: init.use_mlock,
    use_mmap: init.use_mmap,
    n_batch: init.n_batch,
    n_ubatch: init.n_ubatch,
    n_threads: init.n_threads,
    flash_attn_type: init.flash_attn_type,
    cache_type_k: init.cache_type_k,
    cache_type_v: init.cache_type_v,
    speculative: init.speculative,
    no_extra_bufts: init.no_extra_bufts,
    ...(init.devices ? { devices: init.devices } : {}),
    ...(init.model_draft ? { model_draft: init.model_draft } : {}),
    ...(init.speculative
      ? {
          spec_draft_n_gpu_layers: init.spec_draft_n_gpu_layers,
          spec_draft_cache_type_k: init.spec_draft_cache_type_k,
          spec_draft_cache_type_v: init.spec_draft_cache_type_v,
        }
      : {}),
  };
}

/** Default loader: lazy llama.rn import + optional mmproj attach. */
export async function loadLlamaContext(
  filePath: string,
  mmprojPath?: string,
  init?: LlamaInitParams,
): Promise<LlamaContextLike> {
  const { initLlama } = await import("llama.rn");
  // SAFETY: initLlama's LlamaContext is a superset of the structural
  // LlamaContextLike slice (same completion/stop/release signatures).
  const ctx = (await initLlama({
    model: filePath,
    ...(init ? buildInitParams(init) : {}),
  })) as unknown as LlamaContextLike & {
    initMultimodal?: (opts: {
      path: string;
      image_max_tokens?: number;
    }) => Promise<boolean>;
  };
  if (mmprojPath) {
    // image_max_tokens is set when the projector loads, not per completion,
    // so changing it means the next model load picks it up.
    await ctx.initMultimodal?.({
      path: mmprojPath,
      ...(init?.image_max_tokens !== undefined
        ? { image_max_tokens: init.image_max_tokens }
        : {}),
    }).catch(() => false);
  }
  return ctx;
}
