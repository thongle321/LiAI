/** Session usage aggregate line (spec §3 UsageStats). */

import { Text } from "react-native";

import { formatTokens, sumUsage } from "../../lib/chat/usage.ts";
import type { ChatMessage } from "../../types/chat.ts";

export function UsageStats({ messages }: { messages: ChatMessage[] }) {
  const { turns, promptTokens, completionTokens } = sumUsage(messages);
  if (turns === 0) return null;
  return (
    // An opaque pill, not bare text: this is an overlay sitting over message
    // content, so it needs its own fill. A track inside the page is Mist on
    // white, so the pill is Clean White on Cool Paper with a Hairline.
    <Text className="mb-1 self-center rounded-lg border border-border bg-surface-1 px-3 py-1 text-center font-sans text-caption text-secondary-text">
      {turns} turn{turns === 1 ? "" : "s"} · {formatTokens(promptTokens)} in ·{" "}
      {formatTokens(completionTokens)} out
    </Text>
  );
}
