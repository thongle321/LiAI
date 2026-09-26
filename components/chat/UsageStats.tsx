/** Session usage aggregate line (spec §3 UsageStats). */

import { Text } from "react-native";

import { formatTokens, sumUsage } from "../../lib/chat/usage.ts";
import type { ChatMessage } from "../../types/chat.ts";

export function UsageStats({ messages }: { messages: ChatMessage[] }) {
  const { turns, promptTokens, completionTokens } = sumUsage(messages);
  if (turns === 0) return null;
  return (
    <Text className="px-5 pb-1 text-center font-sans text-caption text-secondary-text">
      {turns} turn{turns === 1 ? "" : "s"} · {formatTokens(promptTokens)} in ·{" "}
      {formatTokens(completionTokens)} out
    </Text>
  );
}
