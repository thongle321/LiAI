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
 * The no-model empty state is deliberately NOT this list's ListEmptyComponent,
 * even though pocketpal-ai uses one. KeyboardChatScrollView adds the keyboard
 * height to the scroll viewport as a dynamic contentInset
 * (ScrollViewWithBottomPadding: `dynamic.bottom = bottomPadding.value`), and
 * on Android that is applied on every keyboard open regardless of
 * keyboardLiftBehavior. A centred flex-1 child inside that inset re-centres in
 * the shrunken box, so the empty state visibly MOVED as the keyboard rose.
 * pocketpal-ai gets away with it because their list is a plain FlatList that
 * adds no keyboard inset. ChatScreen renders the empty state as an overlay
 * beside this list instead, where no inset can move it.
 */

import { useCallback, useEffect, useRef, type ReactElement, type RefObject } from "react";
import { FlatList, Platform, type ScrollViewProps } from "react-native";
import {
  KeyboardChatScrollView,
} from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";

import { useMotionDuration } from "../../lib/motion.ts";
import type { ChatRow } from "../../lib/chat/rows.ts";

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
  /** Tracks the growing multiline composer so the newest message is never
   *  clipped behind it. */
  extraContentPadding,
  /** Minimum bottom inset reserved while a reply streams. */
  blankSpace,
  onEndVisibleChange,
  streaming,
}: {
  listRef: RefObject<FlatList<ChatRow> | null>;
  /** Adapter rows (date headers + turns): the list never re-derives. */
  rows: ChatRow[];
  renderRow: (row: ChatRow) => ReactElement | null;
  offset: number;
  extraContentPadding: SharedValue<number>;
  blankSpace: SharedValue<number>;
  /** Fires in BOTH directions (unlike FlatList's onEndReached, which only
   *  fires on entry), which is the state a jump-to-latest button needs. */
  onEndVisibleChange: (visible: boolean) => void;
  /** True while tokens stream: pins visible content (PocketPal
   *  ChatView.tsx:1022 — same thresholds), so the growing bubble doesn't
   *  shove the reader. iOS-only prop, a no-op on Android. */
  streaming: boolean;
}) {
  const motionDuration = useMotionDuration();
  // Mirrors the end state for the scroll effect, which must not re-subscribe
  // to it (it changes on every scroll and would restart the animation).
  const atEndRef = useRef(true);

  // Manual end tracker (PocketPal ChatView.tsx:448-495, adapted): the
  // library's onEndVisible flips on one 20px line with no hysteresis, and
  // two sources for one flag is how screens disagree with themselves — so
  // the library signal is NOT consumed and this is the single source for
  // the pill and the follow flag. Distance from the viewport's bottom edge
  // to the content's end; transitions call out, steady state stays silent.
  const metricsRef = useRef({ offsetY: 0, layoutHeight: 0, contentHeight: 0 });
  const updateAtEnd = useCallback(() => {
    const m = metricsRef.current;
    const distance = m.contentHeight - (m.offsetY + m.layoutHeight);
    const next = atEndRef.current
      ? distance <= LEAVE_DISTANCE
      : distance <= STICK_DISTANCE;
    if (next !== atEndRef.current) {
      atEndRef.current = next;
      onEndVisibleChange(next);
    }
  }, [onEndVisibleChange]);
  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      metricsRef.current.offsetY = event.nativeEvent.contentOffset.y;
      updateAtEnd();
    },
    [updateAtEnd],
  );
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      metricsRef.current.contentHeight = height;
      updateAtEnd();
    },
    [updateAtEnd],
  );
  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      metricsRef.current.layoutHeight = event.nativeEvent.layout.height;
      updateAtEnd();
    },
    [updateAtEnd],
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
    [offset, extraContentPadding, blankSpace],
  );

  // Follow the conversation, but only from the end: a background token
  // stream used to drag a reader out of history mid-sentence. Row count
  // is still the only trigger, so a re-render alone never moves the list.
  const rowCount = rows.length;
  useEffect(() => {
    if (atEndRef.current) {
      listRef.current?.scrollToEnd({ animated: motionDuration > 0 });
    }
  }, [rowCount, motionDuration, listRef]);

  return (
    <FlatList
      ref={listRef}
      data={rows}
      keyExtractor={(row) => (row.kind === "message" ? row.message.id : row.id)}
      renderItem={({ item }) => renderRow(item)}
      renderScrollComponent={renderScrollComponent}
      onScroll={handleScroll}
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleLayout}
      maintainVisibleContentPosition={
        streaming
          ? { minIndexForVisible: 1, autoscrollToTopThreshold: 20 }
          : undefined
      }
      contentContainerClassName="p-5"
      className="flex-1"
    />
  );
}
