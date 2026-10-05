/** Context-window fill, as a share of the model's configured window.
 *
 * Pure, so it is node-testable; it lives here rather than in the banner
 * component because a .tsx that imports react-native cannot be loaded by
 * the plain-Node suite.
 *
 * Both operands already exist — `promptTokens` is the engine's
 * `tokens_evaluated` for the turn, and `nCtx` is the live inference
 * setting — so the banner measures nothing new.
 */

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