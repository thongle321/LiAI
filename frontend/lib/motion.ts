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
import { useIsFocused } from "expo-router";
import { useEffect } from "react";

export const MOTION_DURATION_MS = 200;
export const motionEasing = Easing.out(Easing.quad);

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

/** Tab-switch content fade: the navigator transition stays off (so the
 * bottom bar never moves) and each screen fades its own content in on
 * focus instead. No remount — scroll position survives the switch. */
export function useTabContentFade() {
  const duration = useMotionDuration();
  const opacity = useSharedValue(1);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration, easing: motionEasing });
  }, [focused, duration, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
