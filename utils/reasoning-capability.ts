/** Reasoning capability for a model, two independent axes (PocketPal parity:
 * utils/reasoningCapability.ts).
 *
 * Axis 1 (`enabled` / `hasOverride`) — does the model reason at all; drives
 * the thinking control's on/off state.
 * Axis 2 (`effort`) — whether the model GRADES effort, and to which levels.
 * Only meaningful when axis 1 is on, and only models whose jinja template
 * reads `reasoning_effort` (gpt-oss-style) act on it: llama.rn passes it as
 * `chat_template_kwargs.reasoning_effort`, which llama.cpp applies to the
 * template when the template supports the capability. A template that
 * ignores the kwarg is unaffected — never broken, just inert.
 *
 * Provenance: user override beats detected, exactly as resolveThinking does
 * for the on/off axis (services/inference//thinking.ts).
 *
 * ONE DIVERGENCE FROM POCKETPAL, and why: PocketPal stores a SET of levels
 * a model supports (chips multi-select) and cycles a current level on its
 * composer pill. LiAI has no effort cycle on the pill by design (see the
 * "NO effort cycle" note in components/chat/message-input.tsx), so one
 * level per model is all anything here would ever send — the chips are a
 * radio instead, and the engine takes exactly what the user picked.
 */

/** Canonical effort levels, lowest to highest intensity — the chips'
 * order and the cycle order. */
export const EFFORT_LEVELS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/** First level graded effort picks when the user arms it without choosing
 *  one: the middle of the scale, where "reason a bit harder" is the least
 *  surprising default. (PocketPal pre-selects a three-level SET instead;
 *  ours sends one level per turn — see the module header.) */
export const DEFAULT_EFFORT_LEVEL: EffortLevel = "medium";

/** Chip labels (PocketPal en.json:827-834). */
export const EFFORT_LABELS: Record<EffortLevel, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/** Order any selection canonically, lowest to highest. */

export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * What a turn sends for reasoning effort.
 *
 *  - no override → undefined: the template decides (the honest default —
 *    the reasoning_effort kwarg is inert on templates that ignore it, and
 *    sending nothing means the model's own default reasoning depth
 *    stands).
 *  - "off" is NOT this function's business: axis 1 (the thinking toggle)
 *    decides that, and when thinking is off the caller sends NO kwarg at
 *    all (services/inference//thinking.ts).
 */
export function resolveEffort(
  override: EffortLevel | null | undefined,
): EffortLevel | undefined {
  return override ?? undefined;
}