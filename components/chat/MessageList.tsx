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
 */

import { useCallback, useEffect, useRef, type ReactElement, type RefObject } from "react";
import { FlatList, type ScrollViewProps } from "react-native";
import {
  KeyboardChatScrollView,
} from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";

import { useMotionDuration } from "../../lib/motion.ts";
import type { ChatMessage } from "../../types/chat.ts";

export function MessageList({
  listRef,
  messages,
  renderBubble,
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
}: {
  listRef: RefObject<FlatList<ChatMessage> | null>;
  messages: ChatMessage[];
  renderBubble: (message: ChatMessage) => ReactElement | null;
  offset: number;
  extraContentPadding: SharedValue<number>;
  blankSpace: SharedValue<number>;
  /** Fires in BOTH directions (unlike FlatList's onEndReached, which only
   *  fires on entry), which is the state a jump-to-latest button needs. */
  onEndVisibleChange: (visible: boolean) => void;
}) {
  const motionDuration = useMotionDuration();
  // Mirrors the end state for the scroll effect, which must not re-subscribe
  // to it (it changes on every scroll and would restart the animation).
  const atEndRef = useRef(true);

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
        keyboardDismissMode="interactive"
        onEndVisible={(visible) => {
          atEndRef.current = visible;
          onEndVisibleChange(visible);
        }}
      />
    ),
    [offset, extraContentPadding, blankSpace, onEndVisibleChange],
  );

  // Follow the conversation, but only from the end: a background token
  // stream used to drag a reader out of history mid-sentence. Length is
  // still the only trigger, so a re-render alone never moves the list.
  useEffect(() => {
    if (atEndRef.current) {
      listRef.current?.scrollToEnd({ animated: motionDuration > 0 });
    }
  }, [messages.length, motionDuration, listRef]);

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => renderBubble(item)}
      renderScrollComponent={renderScrollComponent}
      contentContainerClassName="p-5"
      className="flex-1"
    />
  );
}
