/** Per-model thinking resolution (C6): one pure function decides what
 *  the engine receives.
 *
 *  Precedence mirrors PocketPal's provenance minus `learned` (LiAI has
 *  no stream-learning): user override > detected capability > the
 *  global default. An unclassified model — no override, no
 *  `ModelSpec.reasoning` — resolves to the global flag, exactly what
 *  the app sent before this ticket existed; that unchanged-default
 *  behaviour is asserted in tests/thinking-capability.test.ts, not
 *  assumed.
 */

export interface ThinkingResolution {
  /** What the engine should receive for this model. */
  enabled: boolean;
  /** Where the answer came from. `unknown` means "the global decides" —
   *  a user override can only exist for a model id, and detection only
   *  when the spec carries a capability. */
  source: "user" | "detected" | "unknown";
}

export function resolveThinking(input: {
  /** Active local model id; null = no active local model (remote
   *  engines have no enable_thinking flag at all). */
  modelId: string | null;
  /** Typed capability from the model spec; absent = unknown. */
  reasoning?: boolean;
  overrides: Record<string, boolean>;
  globalEnabled: boolean;
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
  return { enabled: input.globalEnabled, source: "unknown" };
}
