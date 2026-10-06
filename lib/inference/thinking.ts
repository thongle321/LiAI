/** Per-model thinking resolution (C6): one pure function decides what
 *  the engine receives.
 *
 * Precedence mirrors PocketPal's provenance minus `learned` (LiAI has
 * no stream-learning): user override > detected capability > NOTHING.
 *
 * The third rung changed. It used to fall back to a global
 * `thinkingEnabled` flag, which meant an UNCLASSIFIED model got
 * `enable_thinking: true` forced onto it — overriding the GGUF chat
 * template's own choice for every model nobody had classified. A model
 * whose template has no thinking branch then answers with an empty
 * completion ("empty reply"), and there was no way to turn the flag off
 * for it. So unknown now resolves to `undefined`: the flag is NOT sent,
 * and llama.cpp uses the template's own default. Absence is the honest
 * answer to "we don't know whether this model reasons".
 *
 * `globalEnabled` is gone from the input for the same reason: with no UI
 * row for it (GenerationSettingsSheet carries none by design), a global
 * can only force a value the model may not support.
 */

export interface ThinkingResolution {
  /** What the engine should receive; `undefined` = send nothing. */
  enabled: boolean | undefined;
  /** Where the answer came from. `unknown` means "the template decides". */
  source: "user" | "detected" | "unknown";
}

export function resolveThinking(input: {
  /** Active local model id; null = no active local model (remote
   *  engines have no enable_thinking flag at all). */
  modelId: string | null;
  /** Typed capability from the model spec; absent = unknown. */
  reasoning?: boolean;
  overrides: Record<string, boolean>;
}): ThinkingResolution {
  const override =
    input.modelId !== null ? input.overrides[input.modelId] : undefined;
  if (override !== undefined) {
    // Explicit user intent beats anything inferred, both directions.
    return { enabled: override, source: "user" };
  }
  if (input.reasoning !== undefined) {
    return { enabled: input.reasoning, source: "detected" };
  }
  return { enabled: undefined, source: "unknown" };
}