/** Pure chat mappers: backend shapes -> render state (tested indirectly). */

import type { HistoryMessage } from "../../types/api.ts";
import type {
  AgentStep,
  ChatMessage,
  ChatSession,
  MessageUsage,
  SessionInfo,
} from "../../types/chat.ts";

let nextId = 0;

/** Local bubble ids (backend turns carry no ids). */
export function newId(): string {
  nextId += 1;
  return `${Date.now()}-${nextId}`;
}

export function toSession(row: SessionInfo): ChatSession {
  const at = Date.parse(row.updated_at);
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned === true,
    at: Number.isFinite(at) ? at : Date.now(),
  };
}

function toUsage(value: unknown): MessageUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const { prompt_tokens, completion_tokens, total_tokens } = v;
  if (
    typeof prompt_tokens !== "number" ||
    typeof completion_tokens !== "number" ||
    typeof total_tokens !== "number"
  ) {
    return undefined;
  }
  return {
    promptTokens: prompt_tokens,
    completionTokens: completion_tokens,
    totalTokens: total_tokens,
  };
}

function toSteps(value: unknown): AgentStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.filter((t): t is string => typeof t === "string");
  return steps.length > 0 ? steps.map((tool) => ({ tool })) : undefined;
}

/** History turns -> bubbles. Images are send-time only (never stored). */
export function toMessages(messages: HistoryMessage[]): ChatMessage[] {
  return messages.map((m) => {
    const metadata =
      typeof m.metadata === "object" && m.metadata !== null ? m.metadata : null;
    const steps = metadata !== null ? toSteps(metadata.tool_calls) : undefined;
    const usage = metadata !== null ? toUsage(metadata.usage) : undefined;
    return {
      id: newId(),
      role: m.role,
      text: m.content,
      at: Date.now(),
      ...(steps !== undefined ? { steps } : {}),
      ...(usage !== undefined ? { usage } : {}),
    };
  });
}
