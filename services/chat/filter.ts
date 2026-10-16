/** In-chat search: case-insensitive substring filter over loaded turns. */

import type { ChatMessage } from "../../types/chat.ts";

/** Turns whose text contains the query; everything on a blank query. */
export function filterMessages(
  messages: ChatMessage[],
  query: string,
): ChatMessage[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return messages;
  return messages.filter((m) => m.text.toLowerCase().includes(needle));
}
