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
  useAnimatedStyle,
  useReducedMotion,
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

/** 0 when the OS asks for reduced motion — entering/exiting with
 * duration 0 renders instantly instead of animating. */
export function useMotionDuration(): number {
  const reduce = useReducedMotion();
  return reduce ? 0 : MOTION_DURATION_MS;
}

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
  const reduced = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    if (reduced) return;
    scale.value = withTiming(0.97, { duration: 100, easing: motionEasing });
  };
  const onPressOut = () => {
    if (reduced) return;
    scale.value = withTiming(1, { duration: 150, easing: motionEasing });
  };

  return { animatedStyle, onPressIn, onPressOut };
}
