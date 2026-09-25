/** llama.rn local engine: thin native wrapper (ADR-0008).
 *
 * The context itself is injected (tests pass fakes); the default loader
 * lazy-imports llama.rn so node --test never touches the native module.
 * One native slot per engine instance — the manager owns switching.
 */

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

/** Params the wrapper forwards (messages/tools/media only). */
export interface LlamaCompletionParams {
  messages: Array<{ role: string; content: string }>;
  tools?: unknown;
  media_paths?: string[];
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

/** Default loader: lazy llama.rn import + optional mmproj attach. */
export async function loadLlamaContext(
  filePath: string,
  mmprojPath?: string,
): Promise<LlamaContextLike> {
  const { initLlama } = await import("llama.rn");
  // SAFETY: initLlama's LlamaContext is a superset of the structural
  // LlamaContextLike slice (same completion/stop/release signatures).
  const ctx = (await initLlama({ model: filePath })) as unknown as LlamaContextLike & {
    initMultimodal?: (opts: { path: string }) => Promise<boolean>;
  };
  if (mmprojPath) {
    await ctx.initMultimodal?.({ path: mmprojPath }).catch(() => false);
  }
  return ctx;
}
