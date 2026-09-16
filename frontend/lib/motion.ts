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
  useReducedMotion,
  type BaseAnimationBuilder,
} from "react-native-reanimated";

export const MOTION_DURATION_MS = 200;
export const motionEasing = Easing.out(Easing.quad);

/** 0 when the OS asks for reduced motion — entering/exiting with
 * duration 0 renders instantly instead of animating. */
export function useMotionDuration(): number {
  return useReducedMotion() ? 0 : MOTION_DURATION_MS;
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
