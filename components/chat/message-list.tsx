/** Message list: greeting fallback, FlatList, follow-the-conversation scroll.
 *
 * Extracted from ChatScreen (Wave 1 chat): bubbles render through a
 * render prop so this stays presentational — store wiring lives above.
 *
 * The list is backed by KeyboardChatScrollView rather than a plain
 * KeyboardAvoidingView around the column. The library's own guide names
 * four limitations of KeyboardAvoidingView on chat layouts (frame drops
 * with behavior="padding", no way to render the first message at the top
 * with translate-with-padding, double-scroll on interactive dismissal,
 * and animation when none is needed), and ships this component for chat
 * instead. All of the keyboard behaviour below is that component's job.
 *
 * The empty state IS this list's ListEmptyComponent (PocketParity:
 * ChatView.tsx:990), and that is what makes it scrollable — the placeholder
 * is content the reader can reach with the keyboard up, not a fixed overlay
 * the keyboard can bury. Two PocketPal details carry it:
 *
 * - `flexGrow: 1` on the content container with centring only while the
 *   list is empty (ChatView.tsx:1038-1041, styles.ts:13-15). Centring needs
 *   the container to fill the viewport, and an empty state taller than that
 *   viewport has to overflow into a scroll rather than squash — hence
 *   flexGrow, not flex-1 on the child.
 * - The composer clearance is a `marginBottom` on the empty state
 *   (ChatEmptyPlaceholder.tsx:86), NOT a keyboard inset. That distinction
 *   is the whole trick: the bottom inset below still rides
 *   KeyboardChatScrollView's dynamic contentInset exactly as before, so
 *   this list is unchanged where it matters, while the empty state's
 *   placement stops depending on it.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactElement, type RefObject } from "react";
import { FlatList, Platform, useWindowDimensions, type ScrollViewProps } from "react-native";
import {
  KeyboardChatScrollView,
} from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { cn } from "@/utils/cn.ts";
import { motionLayout } from "@/utils/motion.ts";


import type { ChatRow } from "@/services/chat/rows.ts";
import { messageWidths, type MessageWidths } from "@/services/chat/message-width.ts";

/** PocketPal STICK/LEAVE hysteresis (ChatView.tsx:451): re-arm "at latest"
 * below 24px from the end, leave it above 40px. The library's own end
 * signal flips on a single 20px threshold with no hysteresis, so a reader
 * resting near the boundary flaps the jump pill and the follow flag.
 * Measured from scroll events (content excludes the keyboard inset, which
 * lives outside contentSize — the same quantities the library uses). */
export const STICK_DISTANCE = 24;
export const LEAVE_DISTANCE = 40;

export function MessageList({
  listRef,
  rows,
  renderRow,
  /** Distance from the list's bottom to the screen's bottom (tab bar +
   *  safe-area inset). Without it the content overshoots by that much
   *  every time the keyboard appears. */
  offset,
  freeze,
  /** Tracks the growing multiline composer so the newest message is never
   *  clipped behind it. The screen adds the floating composer's own height
   *  here, because the empty state now lives INSIDE the list and therefore
   *  has to clear the composer exactly like the last real message does. */
  extraContentPadding,
  /** Minimum bottom inset reserved while a reply streams. */
  blankSpace,
  /** The empty state, drawn as list content (PocketParity, ChatView.tsx:990).
   *  null/absent renders nothing. */
  listEmpty,
  onEndVisibleChange,
  streaming,
}: {
  listRef: RefObject<FlatList<ChatRow> | null>;
  /** Adapter rows (date headers + turns): the list never re-derives. */
  rows: ChatRow[];
  renderRow: (row: ChatRow, widths: MessageWidths) => ReactElement | null;
  offset: number;
  /** Hold the keyboard-driven inset (and with it the scroll position) frozen
   *  while a sheet is open, so dismissing the keyboard to reveal the sheet
   *  does not snap the chat layout (PocketPal parity: freeze, 1.21.9). */
  freeze?: SharedValue<boolean> | boolean;
  extraContentPadding: SharedValue<number>;
  blankSpace: SharedValue<number>;
  /** Empty-state content. Present => the container grows to fill the
   *  viewport and centres it (PocketPal styles.ts:13-15 +
   *  ChatView.tsx:1038-1041); absent => plain top-aligned padding. */
  listEmpty?: ReactElement | null;
  /** Fires in BOTH directions (unlike FlatList's onEndReached, which only
   *  fires on entry), which is the state a jump-to-latest button needs. */
  onEndVisibleChange: (visible: boolean) => void;
  /** True while tokens stream: pins visible content (PocketPal
   *  ChatView.tsx:1022 — same thresholds), so the growing bubble doesn't
   *  shove the reader. iOS-only prop, a no-op on Android. */
  streaming: boolean;
}) {
  // ONE width measurement for the whole list, handed to every row
  // (PocketParity: ChatView.tsx:836-842 computes `min(screenWidth * 0.92,
  // 900)` once and threads it down). useWindowDimensions rather than a
  // module-load Dimensions read, so a rotation re-measures.
  const { width: windowWidth } = useWindowDimensions();
  const widths = useMemo(() => messageWidths(windowWidth), [windowWidth]);

  // Mirrors the end state for the scroll effect, which must not re-subscribe
  // to it (it changes on every scroll and would restart the animation).
  const atEndRef = useRef(true);

  // Manual end tracker (PocketPal ChatView.tsx:448-495, adapted): the
  // library's onEndVisible flips on one 20px line with no hysteresis, and
  // two sources for one flag is how screens disagree with themselves — so
  // the library signal is NOT consumed and this is the single source for
  // the pill and the follow flag. Distance from the viewport's bottom edge
  // to the content's end; transitions call out, steady state stays silent.
  //
  // The three measurements live as shared values and the hysteresis runs in
  // a reaction, i.e. on the UI thread. A scroll handler that reaches JS
  // fires once per frame, which is precisely when the JS thread is busiest
  // laying out a streaming reply (D4-16). JS is woken only on a flip, via
  // scheduleOnRN.
  const offsetY = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const layoutHeight = useSharedValue(0);
  const atEnd = useSharedValue(true);

  /** The one JS-thread landing pad: record the flip for the follow effect,
   *  then tell the parent. Nothing else writes atEndRef. */
  const reportAtEnd = useCallback(
    (visible: boolean) => {
      atEndRef.current = visible;
      onEndVisibleChange(visible);
    },
    [onEndVisibleChange],
  );

  useAnimatedReaction(
    () => {
      const distance = contentHeight.value - (offsetY.value + layoutHeight.value);
      return atEnd.value
        ? distance <= LEAVE_DISTANCE
        : distance <= STICK_DISTANCE;
    },
    (next, previous) => {
      // `previous` is null on the first pass. atEnd already starts true and
      // the list mounts at offset 0, so reporting then would only repeat the
      // state the parent already has.
      if (previous === null || next === previous) return;
      atEnd.value = next;
      scheduleOnRN(reportAtEnd, next);
    },
  );

  const handleScroll = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
    // Underflow guard (PocketPal ChatView.tsx:478-483): when the content is
    // shorter than the viewport it cannot scroll, so the reader is by
    // definition at the end. Force atEnd true here rather than relying on
    // the hysteresis below to converge, so a thread that lands just under
    // the fold can never flicker between followed and not-followed.
    const contentHeight = event.contentSize?.height ?? 0;
    const viewportHeight = event.layoutMeasurement?.height ?? 0;
    if (contentHeight <= viewportHeight + 1) {
      if (!atEnd.value) {
        atEnd.value = true;
        scheduleOnRN(reportAtEnd, true);
      }
    }
  });
  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeight.value = height;
  }, []);
  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      layoutHeight.value = event.nativeEvent.layout.height;
    },
    [],
  );

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardChatScrollView
        {...props}
        // The library simulates the inset itself; RN's own adjustment would
        // double it under a SafeAreaView.
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        offset={offset}
        freeze={freeze}
        extraContentPadding={extraContentPadding}
        blankSpace={blankSpace}
        // Lift only when the reader is already at the conversation. Scrolling
        // back through history should not be shoved around by the keyboard.
        keyboardLiftBehavior="whenAtEnd"
        // iOS only, deliberately. On Android 'interactive' makes a drag
        // forcibly dismiss the keyboard as the only outcome, so the reader
        // can never scroll the list to reveal content the keyboard is
        // hiding. pocketpal-ai gates this the same way (ChatView.tsx:1014).
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
      />
    ),
    [offset, freeze, extraContentPadding, blankSpace],
  );

  // Follow the conversation, but only from the end: a background token
  // stream used to drag a reader out of history mid-sentence. Row count
  // is still the only trigger, so a re-render alone never moves the list.
  const rowCount = rows.length;
  useEffect(() => {
    if (atEndRef.current) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [rowCount, listRef]);

  return (
    <Animated.FlatList
      ref={listRef}
      data={rows}
      keyExtractor={(row) => (row.kind === "message" ? row.message.id : row.id)}
      renderItem={({ item }) => renderRow(item, widths)}
      renderScrollComponent={renderScrollComponent}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleLayout}
      maintainVisibleContentPosition={
        streaming
          ? { minIndexForVisible: 1, autoscrollToTopThreshold: 20 }
          : undefined
      }
      // Render windowing at PocketPal's values (ChatView.tsx:997,1001):
      // a long conversation opens and scrolls without mounting every row.
      // The per-batch cap only throttles cells ENTERING the window while
      // scrolling; rows already inside it — which the streaming bubble and
      // pending row always are, since follow keeps them on screen — render
      // in the same commit, so streaming is unaffected.
      initialNumToRender={10}
      maxToRenderPerBatch={6}
      // flex-grow + centring, but ONLY while the list is empty. That is
      // PocketParity (styles.ts:13-15 flexGrow: 1, ChatView.tsx:1038-1041
      // justifyContent: 'center' only when there are no messages), and it
      // is what lets an empty state taller than the viewport overflow into
      // a scroll instead of squashing to fit. With rows present the padding
      // is all this container needs — forcing growth would strand the last
      // message mid-screen whenever the composer grew.
      contentContainerClassName={cn("p-5", listEmpty && "flex-grow justify-center")}
      ListEmptyComponent={listEmpty ?? undefined}
      className="flex-1"
      // Reflow, not entrance. Per-row entering/exiting on a virtualized list
      // replays every time the render window recycles a row, so scrolling back
      // through history re-animates every bubble (D4-2). Animated.FlatList
      // (not RN's FlatList) is what carries itemLayoutAnimation.
      itemLayoutAnimation={motionLayout()}
    />
  );
}
