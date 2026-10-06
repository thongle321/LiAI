/** Watch-mode frame buffer (vision-series 05).
 *
 * Watch mode captures frames on a timer into a rolling window; NOTHING is
 * inferred until the user asks (chat or voice) — the recorded product
 * decision rejects the reference app's auto-send-per-frame loop, so this
 * module holds only the buffer and interval rules, no inference hooks.
 * Pure, so the aging rule stays tested without a camera seam.
 */

/** Push a frame, dropping the oldest past the cap. Frames age out so a
 *  stale frame can never be the whole answer to "what just happened?".
 *  The cap is the per-turn image limit (MAX_IMAGES) — the buffer can
 *  never overflow the turn it rides. */
export function pushFrame(
  buffer: string[],
  frame: string,
  limit: number,
): string[] {
  const next = [...buffer, frame];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export const WATCH_INTERVAL_MIN_MS = 500;
export const WATCH_INTERVAL_MAX_MS = 5000;
export const WATCH_INTERVAL_DEFAULT_MS = 1000;

/** Clamp a persisted/user-set interval; junk input falls to the default
 *  (PocketPal's ±500 step range, 500–5000 ms). */
export function clampWatchInterval(ms: number): number {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return WATCH_INTERVAL_DEFAULT_MS;
  }
  return Math.min(WATCH_INTERVAL_MAX_MS, Math.max(WATCH_INTERVAL_MIN_MS, Math.round(ms)));
}
