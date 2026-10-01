/** Active-run indicator (PocketPal PendingIndicator, LiAI skin).
 *
 * The visual bottom of the list while tokens arrive: avatar + bubble
 * with three looping dots. Dots run on the UI thread with staggered
 * delays; reduced motion renders them static. No token count or elapsed
 * readout — the store holds usage only on settle and no turn-start stamp,
 * so there is nothing honest to display (add with store turn stats).
 */

import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { APP_NAME } from "../../constants/app.ts";
import { AssistantAvatar } from "./AssistantAvatar.tsx";
import { fadeEntering, fadeExiting, useMotionDuration } from "../../lib/motion.ts";

function Dot({ delayMs }: { delayMs: number }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withDelay(delayMs, withRepeat(withTiming(1, { duration: 500 }), -1, true));
  }, [opacity, delayMs, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={style}
      className="h-2 w-2 rounded-full bg-secondary-text"
    />
  );
}

export function PendingIndicator() {
  const duration = useMotionDuration();
  return (
    <Animated.View
      entering={fadeEntering(duration)}
      exiting={fadeExiting(duration)}
      className="my-1 max-w-[75%] flex-row self-start"
      accessibilityRole="progressbar"
      accessibilityLabel={`${APP_NAME} is replying`}
    >
      <AssistantAvatar shown />
      <View className="flex-row items-center gap-2 rounded-xl rounded-tl-sm border border-border bg-surface-1 px-5 py-4">
        <Dot delayMs={0} />
        <Dot delayMs={200} />
        <Dot delayMs={400} />
      </View>
    </Animated.View>
  );
}
