/** Pure chat mappers: stored turns -> render state (tested indirectly). */

import type {
  AgentStep,
  ChatMessage,
  ChatSession,
  MessageUsage,
  SessionInfo,
} from "../../types/chat.ts";

let nextId = 0;

/** Local bubble ids (stored turns carry no ids). */
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSteps(value: unknown): AgentStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.filter((t): t is string => typeof t === "string");
  return steps.length > 0
    ? steps.map((tool) => ({ tool, status: "done" as const }))
    : undefined;
}

function toRunSteps(value: unknown): AgentStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps: AgentStep[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.name !== "string") continue;
    steps.push({
      tool: row.name,
      status: "done",
      ...(isRecord(row.input) ? { input: row.input } : {}),
      ...(typeof row.result === "string" ? { result: row.result } : {}),
    });
  }
  return steps.length > 0 ? steps : undefined;
}

/** Stored turn shape both readers share (history rows + Supabase rows). */
export interface StoredTurn {
  role: "user" | "assistant";
  content: string;
  metadata?: unknown;
}

/** History turns -> bubbles. Images are send-time only (never stored). */
export function toMessages(messages: StoredTurn[]): ChatMessage[] {
  return messages.map((m) => {
    const metadata =
      typeof m.metadata === "object" && m.metadata !== null
        ? (m.metadata as Record<string, unknown>)
        : null;
    // tool_runs (Wave 2 provenance) wins; bare tool_calls stay as fallback.
    const steps =
      metadata !== null
        ? toRunSteps(metadata.tool_runs) ?? toSteps(metadata.tool_calls)
        : undefined;
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
