/** Shared motion preset: subtle, transform/opacity only.
 *
 * One duration + one easing for every surface, so the app reads as a
 * single motion language. Everything runs on the UI thread via
 * Reanimated; the JS thread never animates. The static BottomNav
 * and composer row never participate.
 */

import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type BaseAnimationBuilder,
} from "react-native-reanimated";

export const MOTION_DURATION_MS = 200;
export const motionEasing = Easing.out(Easing.quad);

/** NOTE: there is deliberately no per-screen focus fade. expo-router's
 * bottom tabs run with no transition unless an `animation` option is set
 * (BottomTabView hasAnimation() -> false without it), so a fade here was
 * the ONLY motion on a tab switch — a 200ms opacity animation wrapped
 * around the whole tab subtree (message list, camera preview), which
 * forces full-screen offscreen compositing and janks the switch on
 * Android. Tab switches are instant: nothing fades, nothing re-centres. */

/* ------------------------------------------------------------------ *
 * The two Models-screen menu reveals, ported from react-native-paper
 * 5.14.5 (the version PocketPal pins) so LiAI shows the same motion
 * without taking on paper as a second design system.
 * ------------------------------------------------------------------ */

/** Paper's Menu: ANIMATION_DURATION = 250, EASING = bezier(0.4, 0, 0.2, 1)
 * — the Material standard curve. Both multiplied by theme.animation.scale,
 * which paper defaults to 1.0, so these are the real numbers. */
export const MENU_DURATION_MS = 250;
const menuEasing = Easing.bezier(0.4, 0, 0.2, 1);

/** Paper's FAB group specifies no easing, so RN's timing default applies. */
export const ACTION_DURATION_MS = 150;
const actionEasing = Easing.inOut(Easing.ease);

/** Filter menu: grows out of the control that opened it — pinned to the
 * top-right, where that icon sits (the caller sets
 * `transformOrigin: "right top"` on the view). Open runs scale 0 → 1 and
 * opacity 0 → 1 in parallel; close reverses opacity ONLY — paper never
 * reverses the scale. Declarative entering/exiting: the animation binds to
 * mount/unmount, so it cannot start before the view exists. */
export function menuEnteringFade(durationMs: number): BaseAnimationBuilder {
  return FadeIn.duration(durationMs).easing(menuEasing);
}

/** Inner half of the menu reveal — scale only. The caller nests it inside
 * the fade above and pins `transformOrigin: "right top"` on this view so
 * the menu grows out of the control that opened it. */
export function menuEnteringZoom(durationMs: number): BaseAnimationBuilder {
  return ZoomIn.duration(durationMs).easing(menuEasing);
}

export function menuExiting(durationMs: number): BaseAnimationBuilder {
  return FadeOut.duration(durationMs).easing(menuEasing);
}

/** Add-menu action: the whole row rises into place while fading in.
 * Open staggers 15ms per step with the bottom action first (paper reverses
 * the array — the caller passes ACTION_STAGGER_MS * (count - 1 - index));
 * close runs every row in parallel with no stagger. */
export const ACTION_STAGGER_MS = 15;

export function fabActionEntering(
  durationMs: number,
  delayMs: number,
): BaseAnimationBuilder {
  return FadeInDown.duration(durationMs).easing(actionEasing).delay(delayMs);
}

export function fabActionExiting(durationMs: number): BaseAnimationBuilder {
  return FadeOut.duration(durationMs).easing(actionEasing);
}

/** Add-menu backdrop: a plain fade (250ms in / 200ms out) over PocketPal's
 * white surface. No builder of its own — the caller reuses
 * fadeEntering/fadeExiting with those durations. */

/** New chat bubbles slide up once on mount (keyed by message id). */
export function bubbleEntering(durationMs: number): BaseAnimationBuilder {
  return FadeInDown.duration(durationMs).easing(motionEasing);
}

/** Transient rows: typing indicator, voice status, issue lines. */
export function fadeEntering(durationMs: number): BaseAnimationBuilder {
  return FadeIn.duration(durationMs).easing(motionEasing);
}

export function fadeExiting(durationMs: number): BaseAnimationBuilder {
  return FadeOut.duration(durationMs).easing(motionEasing);
}

/** Press feedback: scale 0.97 on press-in, spring back on press-out.
 * Runs entirely on the UI thread — no setState, no re-render.
 * Full-width list rows should highlight their background instead. */
export function usePressFeedback() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withTiming(0.97, { duration: 100, easing: motionEasing });
  };
  const onPressOut = () => {
    scale.value = withTiming(1, { duration: 150, easing: motionEasing });
  };

  return { animatedStyle, onPressIn, onPressOut };
}
