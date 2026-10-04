/** Active-run indicator (PocketPal PendingIndicator, LiAI skin).
 *
 * The visual bottom of the list while tokens arrive: avatar + bubble
 * with three looping dots. Dots run on the UI thread with staggered
 * delays and always animate, like PocketPal.
 *
 * **Elapsed seconds, not a token count (G13).** The store holds usage only
 * on settle, so a mid-turn token number would have to be counted from
 * streamed text deltas — which is characters, not tokens. Printing that
 * as "1,240 tokens" would be a confident-looking lie. Wall clock is
 * measured honestly and is what the reader actually wants to know: is
 * this moving, or stuck?
 *
 * PocketPal's "Stopping…" state is deliberately NOT reproduced. Showing it
 * means holding `sending` true while the engine unwinds, which blocks the
 * user from sending anything until teardown finishes. `stop()` clears
 * `sending` synchronously instead, and the partial reply is already
 * marked settled. One consequence worth naming: because `stop()` also
 * clears `turnStartedAt`, the timer vanishes the instant Stop is
 * pressed, so a long stopped turn leaves no trace of how long it ran.
 * That tradeoff is recorded in the audit as open.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { APP_NAME } from "../../constants/app.ts";
import { AssistantAvatar } from "./AssistantAvatar.tsx";
import { MOTION_DURATION_MS, fadeEntering, fadeExiting } from "../../lib/motion.ts";

function Dot({ delayMs }: { delayMs: number }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withDelay(delayMs, withRepeat(withTiming(1, { duration: 500 }), -1, true));
  }, [opacity, delayMs]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={style}
      className="h-2 w-2 rounded-full bg-secondary-text"
    />
  );
}

/** Ticks once a second while a turn runs. Null start means nothing is
 *  running, so there is nothing to count. */
function useElapsed(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export function PendingIndicator({ startedAt }: { startedAt: number | null }) {
  const duration = MOTION_DURATION_MS;
  const elapsed = useElapsed(startedAt);
  return (
    <Animated.View
      entering={fadeEntering(duration)}
      exiting={fadeExiting(duration)}
      className="my-1 max-w-[75%] flex-row self-start"
      accessibilityRole="progressbar"
      // Seconds are spoken, not just drawn: a screen-reader user gets the
      // same "is it stuck?" signal a sighted one does.
      accessibilityLabel={
        elapsed === 0
          ? `${APP_NAME} is replying`
          : `${APP_NAME} is replying, ${elapsed} seconds`
      }
    >
      <AssistantAvatar shown />
      <View className="flex-row items-center gap-2 rounded-xl rounded-tl-sm border border-border bg-surface-1 px-5 py-4">
        <Dot delayMs={0} />
        <Dot delayMs={200} />
        <Dot delayMs={400} />
        {elapsed > 0 && (
          <Text className="ml-1 font-sans text-micro text-secondary-text">
            {elapsed}s
          </Text>
        )}
      </View>
    </Animated.View>
  );
}