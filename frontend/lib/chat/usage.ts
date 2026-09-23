/** Session usage aggregate: summed token counts over finished turns. */

import type { ChatMessage } from "../../types/chat.ts";

export interface SessionUsage {
  turns: number;
  promptTokens: number;
  completionTokens: number;
}

/** Totals over assistant turns that reported usage (streaming stubs skip). */
export function sumUsage(messages: ChatMessage[]): SessionUsage {
  let turns = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  for (const m of messages) {
    if (m.role !== "assistant" || m.usage === undefined) continue;
    turns += 1;
    promptTokens += m.usage.promptTokens;
    completionTokens += m.usage.completionTokens;
  }
  return { turns, promptTokens, completionTokens };
}

/** Compact count for caption space (1200 → "1.2k"). */
export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
}
