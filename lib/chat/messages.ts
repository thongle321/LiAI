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
import type { StoredMessage } from "./session-store.ts";

let nextId = 0;

/** Local ids: a timestamp prefix keeps them unique across restarts, the
 *  counter orders them inside one millisecond. */
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

/** Stored messages -> bubbles, KEEPING the store's row id.
 *
 *  The id used to be minted here (`newId()`), justified by "nothing
 *  persists a reference to a bubble". That stopped being true the moment
 *  regenerate-from-the-middle, edit-and-resend and delete all needed to
 *  address a bubble that had been persisted. Carrying the row id means a
 *  reloaded conversation is addressable by the same ids it had live. */
export function toMessages(turns: StoredMessage[]): ChatMessage[] {
  return turns.map((turn) => ({
    id: turn.id,
    role: turn.role,
    text: turn.content,
    at: turn.at ?? Date.now(),
    ...(turn.steps !== undefined && turn.steps.length > 0
      ? { steps: turn.steps }
      : {}),
    ...(turn.reasoning !== undefined ? { reasoning: turn.reasoning } : {}),
    ...(turn.usage !== undefined ? { usage: turn.usage } : {}),
    // Carried straight through: a reloaded reply keeps its block order,
    // or history would render with a layout the model never produced.
    ...(turn.blocks !== undefined ? { blocks: turn.blocks } : {}),
    // Carried straight through: a reloaded reply must still know how it
    // ended, or the context banner and turn footer lose their subject.
    ...(turn.outcome !== undefined ? { outcome: turn.outcome } : {}),
  }));
}
