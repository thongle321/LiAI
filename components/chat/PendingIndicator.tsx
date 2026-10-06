/** Active-run indicator (PocketPal PendingIndicator, LiAI skin).
 *
 * The visual bottom of the list while tokens arrive: avatar + bubble
 * with three looping dots. Dots run on the UI thread with staggered
 * delays and always animate, like PocketPal.
 *
 * **Elapsed seconds, not a token count (G13).** The store holds usage only
 * on settle, so a mid-turn token number would have to be counted from
 * streamed text deltas — which are characters, not tokens. Printing that
 * as "1,240 tokens" would be a confident-looking lie. Wall clock is
 * measured honestly and is what the reader actually wants to know: is
 * this moving, or stuck?
 *
 * **Phase label — the omission, reversed (ticket 02).** This row long
 * OMITTED any "which talent is running" label: a wrong label (claiming
 * a tool is running while the model merely writes text) was judged
 * worse than none. The store now carries `pendingToolName` for the
 * exact span a tool call is in flight, so naming the talent is safe —
 * and the case the omission used to protect against (no tool running)
 * is handled by the store holding null, not by the row staying silent.
 * `phaseLabel` maps the name to words, or yields undefined when nothing
 * runs; `formatPendingSuffix` joins phase and elapsed on one line.
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
import { useChatStore } from "../../store/chat";
import { formatPendingSuffix, phaseLabel } from "../../lib/chat/pending-phase.ts";

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
  // The in-flight talent arrives through the store, not a prop: the
  // caller (chat.tsx) passes only startedAt, and one place — the store —
  // knows the turn is running and which tool it is.
  const toolName = useChatStore((s) => s.pendingToolName);
  // The store's absent is null; the pure module's absent is undefined.
  const phase = phaseLabel(toolName ?? undefined);
  const suffix = formatPendingSuffix({ phase, elapsed });
  const phaseWords = phase ? `, ${phase} phase` : "";
  return (
    <Animated.View
      entering={fadeEntering(duration)}
      exiting={fadeExiting(duration)}
      className="my-1 max-w-[75%] flex-row self-start"
      accessibilityRole="progressbar"
      // Seconds are spoken, not just drawn: a screen-reader user gets the
      // same "is it stuck?" signal a sighted one does. The phase joins
      // the speech while a tool runs; the elapsed count never leaves.
      accessibilityLabel={
        elapsed === 0
          ? `${APP_NAME} is replying${phaseWords}`
          : `${APP_NAME} is replying${phaseWords}, ${elapsed} seconds`
      }
    >
      <AssistantAvatar shown />
      <View className="flex-row items-center gap-2 rounded-xl rounded-tl-sm border border-border bg-surface-1 px-5 py-4">
        <Dot delayMs={0} />
        <Dot delayMs={200} />
        <Dot delayMs={400} />
        {suffix !== "" && (
          <Text className="ml-1 font-sans text-micro text-secondary-text">
            {suffix}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
