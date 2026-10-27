/** Collapse/expand gesture thresholds, verbatim from PocketPal's
 *  VoiceModeView and VoiceBar (spec: voice-tab hands-free parity — the
 *  numbers are the reference's runtime values, pinned here so the two
 *  surfaces stay in tune). */

/** A downward pull this long (pt) collapses the full view. */
export const VOICE_PULL_COLLAPSE_PT = 80;
/** A downward flick this fast (pt/s) collapses whatever the distance. */
export const VOICE_FLICK_VELOCITY = 800;
/** An upward swipe this long (pt) expands the bar. */
export const VOICE_EXPAND_SWIPE_PT = 40;
/** How far the bar follows the finger up (pt) before the view takes over. */
export const VOICE_LIFT_LIMIT_PT = 120;

/** The full view's pull-down ends in a collapse. */
export function pullsCollapse(
  translationY: number,
  velocityY: number,
): boolean {
  "worklet";
  return (
    translationY > VOICE_PULL_COLLAPSE_PT || velocityY > VOICE_FLICK_VELOCITY
  );
}

/** The bar's lift ends in an expansion. */
export function liftsExpand(
  translationY: number,
  velocityY: number,
): boolean {
  "worklet";
  return (
    translationY < -VOICE_EXPAND_SWIPE_PT || velocityY < -VOICE_FLICK_VELOCITY
  );
}
