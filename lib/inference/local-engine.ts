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
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/** Structural slice of a llama.rn completion result we actually read. */
export interface LlamaCompletionResult {
  text?: string;
  content?: string;
  tool_calls?: LlamaTokenData["tool_calls"];
  tokens_predicted?: number;
  tokens_evaluated?: number;
}

/** Params the wrapper forwards (messages/tools/media/thinking/sampler). */
export interface LlamaCompletionParams extends Partial<LlamaSamplerParams> {
  messages: Array<{ role: string; content: string }>;
  tools?: unknown;
  media_paths?: string[];
  enable_thinking?: boolean;
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
      const result = await ctx.completion(
        {
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          ...(request.tools && request.tools.length > 0
            ? { tools: request.tools }
            : {}),
          ...(request.imagePaths && request.imagePaths.length > 0
            ? { media_paths: request.imagePaths }
            : {}),
          ...(request.enableThinking !== undefined
            ? { enable_thinking: request.enableThinking }
            : {}),
          // Flat, top-level, and NOT nested under a key: llama.rn's
          // NativeCompletionParams takes these as siblings (types.d.ts), and
          // the JSI converter drops unknown keys. Nesting them under
          // `sampler:` compiles, type-checks, passes every test, and does
          // nothing at runtime.
          ...(request.sampler ? toLlamaSampler(request.sampler) : {}),
        },
        (data) => {
          const delta = data.content ?? data.token ?? "";
          if (delta !== "") callbacks.onToken(delta);
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
      return {
        text: result.content ?? result.text ?? "",
        toolCalls,
        promptTokens: asNumber(result.tokens_evaluated),
        completionTokens: asNumber(result.tokens_predicted),
        stoppedEarly: false,
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
    ...(init
      ? {
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
          ...(init.speculative
            ? {
                spec_draft_n_gpu_layers: init.spec_draft_n_gpu_layers,
                spec_draft_cache_type_k: init.spec_draft_cache_type_k,
                spec_draft_cache_type_v: init.spec_draft_cache_type_v,
              }
            : {}),
        }
      : {}),
  })) as unknown as LlamaContextLike & {
    initMultimodal?: (opts: { path: string }) => Promise<boolean>;
  };
  if (mmprojPath) {
    await ctx.initMultimodal?.({ path: mmprojPath }).catch(() => false);
  }
  return ctx;
}
