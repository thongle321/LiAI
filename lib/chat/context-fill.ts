/** Context-window fill, as a share of the model's configured window.
 *
 * Pure, so it is node-testable; it lives here rather than in the banner
 * component because a .tsx that imports react-native cannot be loaded by
 * the plain-Node suite.
 *
 * Both operands already exist — `promptTokens` is the turn's
 * `CompletionOutcome.promptTokens` (C3: local KV residency via
 * `tokens_cached`, remote `prompt_tokens` — not merely the
 * re-processed count), and the window is the effective one below —
 * so the banner measures nothing new.
 */

import { positiveFinite } from "../guards.ts";

/** PocketPal's WARNING_THRESHOLD (bannerVariantResolver.ts:3): the fill
 *  percent at which the soft warning fires, before a turn can fail. */
export const NEAR_LIMIT_FILL_PCT = 80;

/** The denominator the meter and the threshold divide by — PocketPal's
 *  `effectiveNCtx`. A local model divides by the configured nCtx; a
 *  remote one divides by its probed /props `contextLength` (C7), which
 *  is known only once a probe has landed (PocketPal's own gate). An
 *  unknown remote window is `undefined`, never the local setting — a
 *  remote thread divided by another engine's window is a lie. */
export function effectiveNCtx(input: {
  isRemote: boolean;
  localNCtx: number;
  remoteContextLength: number | undefined;
}): number | undefined {
  if (!input.isRemote) return input.localNCtx;
  return positiveFinite(input.remoteContextLength);
}

/** A threshold warning while the thread is still usable (C4): fill at or
 *  above NEAR_LIMIT_FILL_PCT. Absent occupancy or an unknown window is
 *  NOT evidence of fullness — never warn blind. Uses `fillPercent`, so
 *  the trigger and the displayed percent can never disagree. */
export function isNearLimit(
  promptTokens: number | undefined,
  windowSize: number | undefined,
): boolean {
  if (windowSize === undefined || windowSize <= 0) return false;
  return fillPercent(promptTokens, windowSize) >= NEAR_LIMIT_FILL_PCT;
}

/** 0-100, clamped for display.
 *
 *  Clamping is not cosmetic: a remote endpoint or a mid-turn estimate can
 *  report more prompt tokens than the configured window, and a meter at
 *  137% would be a bug report waiting to happen. */
export function fillPercent(promptTokens: number | undefined, nCtx: number): number {
  if (promptTokens === undefined || nCtx <= 0) return 0;
  const pct = Math.round((promptTokens / nCtx) * 100);
  return Math.max(0, Math.min(100, pct));
}