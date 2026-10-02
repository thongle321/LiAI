/** Pure chat mappers: stored turns -> render state (tested indirectly).
 *
 * The store hands back typed turns (ADR-0012): usage is already numbers
 * and tool calls are already ordered rows, so this file no longer parses
 * a JSON metadata blob — it only stamps the client-side bits a bubble
 * needs (its own id, and a timestamp for a turn that somehow has none).
 */

import type {
  ChatMessage,
  ChatSession,
  SessionInfo,
} from "../../types/chat.ts";
import type { StoredTurn } from "./session-store.ts";

let nextId = 0;

/** Local bubble ids: store row ids are not carried into render state,
 * because nothing persists a reference to a bubble. */
export function newId(): string {
  nextId += 1;
  return `${Date.now()}-${nextId}`;
}

export function toSession(row: SessionInfo): ChatSession {
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned === true,
    at: row.updatedAt,
  };
}

/** Stored turns -> bubbles. */
export function toMessages(turns: StoredTurn[]): ChatMessage[] {
  return turns.map((turn) => ({
    id: newId(),
    role: turn.role,
    text: turn.content,
    at: turn.at ?? Date.now(),
    ...(turn.steps !== undefined && turn.steps.length > 0
      ? { steps: turn.steps }
      : {}),
    ...(turn.reasoning !== undefined ? { reasoning: turn.reasoning } : {}),
    ...(turn.usage !== undefined ? { usage: turn.usage } : {}),
  }));
}
