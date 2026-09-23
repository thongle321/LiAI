/** Message list: greeting fallback, FlatList, follow-the-conversation scroll.
 *
 * Extracted from ChatScreen (Wave 1 chat): bubbles render through a
 * render prop so this stays presentational — store wiring lives above.
 */

import { useEffect, useRef, type ReactElement } from "react";
import { FlatList } from "react-native";

import { useMotionDuration } from "../../lib/motion.ts";
import type { ChatMessage } from "../../types/chat.ts";

// Design's opening line, fixed once (visual only until the first exchange).
// Exported so ChatScreen can recognise it (no actions on the greeting).
export const GREETING_ID = "greeting";

const GREETING: ChatMessage = {
  id: GREETING_ID,
  role: "assistant",
  text: "Hey there.\nWhat would you like to do today?",
  at: Date.now(),
};

export function MessageList({
  messages,
  renderBubble,
}: {
  messages: ChatMessage[];
  renderBubble: (message: ChatMessage) => ReactElement | null;
}) {
  // Design's opening line, visual only until the first real exchange.
  const visibleMessages: ChatMessage[] =
    messages.length === 0 ? [GREETING] : messages;
  // Follow the conversation: a new bubble lands below the fold, so
  // pin the list to the end on every new message (never on re-render
  // alone — length is the only trigger, reading history stays put).
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const motionDuration = useMotionDuration();
  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: motionDuration > 0 });
  }, [visibleMessages.length, motionDuration]);

  return (
    <FlatList
      ref={listRef}
      data={visibleMessages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => renderBubble(item)}
      contentContainerClassName="p-4"
      className="flex-1"
    />
  );
}
