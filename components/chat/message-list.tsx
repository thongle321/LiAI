/** Message list: greeting fallback, FlatList, follow-the-conversation scroll.
 *
 * The 2026-10-29 full port (docs/research/2026-10-29-chat-composer-full-port.md):
 * PocketPal's own list recipe replaces the keyboard-controller scroll
 * vehicle — the keyboard library's chat scroll view is GONE from this
 * file's app code — with a
 * PLAIN `Animated.FlatList`, inverted — so index 0 = the newest turn and a
 * growing stream stays pinned at its end with no JS scroll loop — reserved
 * by a ListHeaderComponent spacer fed by the route's ONE occlusion value.
 * Running their exact mechanisms:
 *
 * - `maintainVisibleContentPosition {minIndexForVisible: 1,
 *   autoscrollToTopThreshold: 20}` gated on streaming (ChatView.tsx:1089-1096)
 *   keeps the growing turn within 20px of the composer on iOS; the inverted
 *   flip does the pinning on Android, where the prop is a no-op.
 * - The ONLY JS scroll call is PocketPal's auto-scroll on a new USER message
 *   (ChatView.tsx:626-640, scrollToOffset 0 on their end).
 * - `keyboardDismissMode` is platform-gated (ChatView.tsx:1082): iOS keeps
 *   interactive drag-dismiss; Android uses "none" because "interactive"
 *   there makes the drag-forced dismiss the only outcome.
 * - The empty state is ListEmptyComponent content again: with no dynamic
 *   inset re-centring it, the divergence that made it an overlay is gone
 *   (docs/research/2026-10-08-pocketpal-chat-empty-view-keyboard.md).
 *
 * Bubbles render through a render prop so this stays presentational — store
 * wiring lives above.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactElement, type ReactNode, type RefObject } from "react";
import { FlatList, Platform, useWindowDimensions } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { ChatRow, MessageRow } from "@/services/chat/rows.ts";
import { messageWidths, type MessageWidths } from "@/services/chat/message-width.ts";

/** PocketPal STICK/LEAVE hysteresis (ChatView.tsx:497-498): re-arm "at latest"
 *  at 24px from the end, leave it above 40px (inverted-list offsets — small
 *  `y` IS the end). The library's own end signal flips on a single 20px
 *  threshold with no hysteresis, so a reader resting near the boundary flaps
 *  the jump pill. */
export const STICK_DISTANCE = 24;
export const LEAVE_DISTANCE = 40;
/** PocketPal's EPS: content within 1px of the viewport is "underflow" — it
 *  cannot scroll, so the reader is definitionally at the end. */
const EPS = 1;

export function MessageList({
  listRef,
  rows,
  renderRow,
  renderPending,
  /** The MEASURED composer height. The list reserves it with its own
   *  marginBottom (PocketPal's `bottomComponentHeight` margin), so the
   *  newest turn can never sit behind the floating composer. */
  composerHeight,
  /** The route's ONE reconciled keyboard-occlusion value — the same shared
   *  value that translates the composer and its overlays. The header spacer
   *  reads it so list and composer can never disagree mid-animation. */
  occlusion,
  listEmpty,
  onEndVisibleChange,
  streaming,
}: {
  listRef: RefObject<FlatList<MessageRow> | null>;
  /** Adapter rows (turns + the pending row): the list never re-derives. */
  rows: ChatRow[];
  /** Message rows only — the pending indicator renders from the header,
   *  never from data (see renderPending). */
  renderRow: (row: MessageRow, widths: MessageWidths) => ReactElement | null;
  /** The active-run indicator, drawn inside the ListHeaderComponent where
   *  PocketPal draws theirs (visually BELOW the newest turn on the inverted
   *  list). It needs the list's measured widths, so it is a callback. */
  renderPending: (widths: MessageWidths) => ReactNode;
  /** Measured composer height (the list's marginBottom). */
  composerHeight: number;
  /** The route's ONE reconciled occlusion shared value. */
  occlusion: SharedValue<number>;
  /** The empty thread's content (rendered as ListEmptyComponent, centred by
   *  the container when the thread has no rows). */
  listEmpty: ReactElement | null;
  /** Fires in BOTH directions (unlike FlatList's onEndReached, which only
   *  fires on entry), which is the state a jump-to-latest button needs. */
  onEndVisibleChange: (visible: boolean) => void;
  /** True while tokens stream: pins visible content with PocketPal's exact
   *  MVCP config (ChatView.tsx:1089-1096), so the growing bubble doesn't
   *  shove the reader. iOS-only prop, a no-op on Android. */
  streaming: boolean;
}) {
  // ONE width measurement for the whole list, handed to every row
  // (PocketParity: ChatView.tsx:836-842 computes `min(screenWidth * 0.92,
  // 900)` once and threads it down). useWindowDimensions rather than a
  // module-load Dimensions read, so a rotation re-measures.
  const { width: windowWidth } = useWindowDimensions();
  const widths = useMemo(() => messageWidths(windowWidth), [windowWidth]);

  // The list's data: message rows ONLY, newest first. The pending row stays
  // out of data — on the inverted list it would be index 0, resizing
  // exactly the index MVCP's `minIndexForVisible: 1` intends to leave free
  // (PocketPal renders it in the ListHeaderComponent for the same reason).
  // rows.ts keeps appending the pending row as its adapter shape (active
  // run OR a stopping turn); this is its rendering location.
  const data = useMemo(
    () => rows.filter((row) => row.kind === "message").reverse(),
    [rows],
  );
  const pending = rows[rows.length - 1]?.kind === "pending";

  // Report the flip for the parent's jump pill. Nothing else writes it.
  const reportAtEnd = useCallback(
    (visible: boolean) => {
      onEndVisibleChange(visible);
    },
    [onEndVisibleChange],
  );

  // PocketPal's scroll tracker (ChatView.tsx:492-525), inverted-aware:
  // on this list offset 0 IS the end (the newest turn), so distance from the
  // end is simply the clamped offset. All per-frame work stays on the UI
  // thread (D4-16); a JS landing pad is woken only when the flag flips.
  const underflow = useSharedValue(true);
  const atLatest = useSharedValue(true);

  const handleScroll = useAnimatedScrollHandler((event) => {
    const offsetY = event.contentOffset.y;
    const contentHeight = event.contentSize?.height ?? 0;
    const viewportHeight = event.layoutMeasurement?.height ?? 0;
    const maxY = Math.max(0, contentHeight - viewportHeight);

    // Underflow: content can't actually scroll (flexGrow:1 keeps content
    // ≈ viewport for the empty thread), so the reader is at the end.
    underflow.value = contentHeight <= viewportHeight + EPS;

    // Clamp to kill rubber-band noise (an inverted list can bounce y < 0
    // exactly when pulled at the end — never read that as "scrolled away").
    const clampedY = Math.min(Math.max(offsetY, 0), maxY);

    if (underflow.value) {
      atLatest.value = true;
      return;
    }
    if (atLatest.value) {
      if (clampedY > LEAVE_DISTANCE) atLatest.value = false;
    } else if (clampedY < STICK_DISTANCE) {
      atLatest.value = true;
    }
  });

  useAnimatedReaction(
    () => (underflow.value || atLatest.value ? 1 : 0),
    (next, previous) => {
      // `previous` is null on the first pass. The reaction starts with the
      // reader at the end (parent state starts true), so reporting then
      // would only repeat state the parent already has.
      if (previous === null || next === previous) return;
      scheduleOnRN(reportAtEnd, next === 1);
    },
  );

  // The spacer's own animated style, derived from the shared occlusion.
  const headerStyle = useAnimatedStyle(() => ({
    height: occlusion.value,
  }));

  const renderListHeaderComponent = useCallback(
    () => (
      <>
        {pending && renderPending(widths)}
        {/* PocketPal's keyboard spacer (their headerStyle): height is the
            SAME reconciled occlusion the composer lifts by, so when the
            keyboard opens the newest turn rises welded to the composer. */}
        {data.length > 0 && <Animated.View style={headerStyle} />}
      </>
    ),
    [pending, data.length, renderPending, widths, headerStyle],
  );

  // ============ AUTO-SCROLL ON NEW USER MESSAGE ============
  // PocketPal's exact effect (ChatView.tsx:626-640): scroll ONLY when the
  // newest row FLIPS to a user message the reader has not seen — a send
  // jumps to the reply even from history (offset 0 is this list's end).
  // Streaming growth is never scrolled from JS: inversion + MVCP pin it.
  const previousData = useRef<MessageRow[] | null>(null);
  useEffect(() => {
    const newest = data[0];
    const previous = previousData.current;
    previousData.current = data;
    if (
      newest !== undefined &&
      previous?.[0]?.message.id !== newest.message.id &&
      newest.message.role === "user"
    ) {
      listRef.current?.scrollToOffset({ animated: true, offset: 0 });
    }
  }, [data, listRef]);

  return (
    <Animated.FlatList
      ref={listRef}
      data={data}
      inverted={data.length > 0}
      automaticallyAdjustContentInsets={false}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
      ListHeaderComponent={renderListHeaderComponent}
      ListEmptyComponent={listEmpty}
      maintainVisibleContentPosition={
        streaming
          ? { minIndexForVisible: 1, autoscrollToTopThreshold: 20 }
          : undefined
      }
      // Render windowing at PocketPal's values (ChatView.tsx:997,1001):
      // a long conversation opens and scrolls without mounting every row.
      initialNumToRender={10}
      maxToRenderPerBatch={6}
      onScroll={handleScroll}
      // PocketPal centres the empty thread with flexGrow + justify-center
      // (their flatListContentContainer): with no dynamic inset to move it,
      // the centred empty state is stable in both keyboard states again.
      contentContainerClassName="p-6"
      contentContainerStyle={
        data.length === 0
          ? [{ flexGrow: 1 }, { justifyContent: "center" }]
          : undefined
      }
      style={{ marginBottom: composerHeight }}
      className="flex-1"
      // NO layout animation on the rows here. Reanimated layout animations
      // do not compose with `inverted` lists — rows animate to colliding
      // positions and can settle overlapped (the reported "my message and
      // the AI message stick together"). PocketPal's list carries none
      // either; per-row motion stops at PendingIndicator's own fade.
      renderItem={({ item }) => renderRow(item, widths)}
      keyExtractor={(row) => row.message.id}
    />
  );
}
