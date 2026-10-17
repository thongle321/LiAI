/** Message-view rows: PocketPal-shaped derivation over our turns.
 *
 * The adapter the phase-1 port agreed on: the store keeps Zustand
 * `ChatMessage[]`, and this pure module derives everything the list needs
 * that the messages don't state — group flags (avatar once per group), the
 * active run, and the user-turn status. View components read rows, never
 * re-derive.
 *
 * PonPal parity: no day dividers. PocketPal's `showDateHeaders` defaults
 * false and ChatScreen never passes it, so their list renders none — this
 * adapter matches, and the date header component is deleted. The day
 * boundary still exists in the DATA: it ends a visual group, so turns that
 * straddle midnight are not welded into one.
 *
 * ponytail: no delivered/seen statuses — the store tracks sent only;
 * add when it tracks more.
 */

import type { ChatMessage } from "@/types/chat.ts";

export interface MessageRow {
  kind: "message";
  message: ChatMessage;
  /** Next turn continues the group: tighter vertical rhythm. */
  grouped: boolean;
  /** Newest turn while tokens arrive: the pending row's anchor. */
  isActiveRun: boolean;
  /** User-turn delivery state. `failed` when the turn's own reply carries
   * an error: the store records a failed send on the assistant stub, and
   * retry() clears it before rerunning. The row only reports delivery —
   * a failed turn's reason and its retry live in the snackbar
   * (PocketParity: PocketPal has no error bubble in the list at all). */
  status: "sending" | "sent" | "failed";
}

/** Active-run indicator (PocketPal PendingIndicator): the visual bottom of
 * the list while tokens arrive. Appended by the adapter — never stored.
 * Not exported: nothing outside this module names it — the exported
 * ChatRow union carries it (knip:export). */
export interface PendingRow {
  kind: "pending";
  id: "pending";
}

export type ChatRow = MessageRow | PendingRow;

function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** One delivery state per user row, in the order it can apply.
 *
 * `next` is the turn's own reply: a send that failed left its error there,
 * so the question never landed. Only the message IMMEDIATELY after counts —
 * otherwise one failure would smear across every later question. */
function deliveryStatus(
  message: ChatMessage,
  next: ChatMessage | undefined,
  sendingNow: boolean,
): MessageRow["status"] {
  if (message.role !== "user") return "sent";
  if (sendingNow) return "sending";
  return next?.error !== undefined ? "failed" : "sent";
}

/** Rows for the list: one row per turn, plus the pending row while a
 * reply streams. */
export function buildRows(
  messages: ChatMessage[],
  opts?: { now?: number; sending?: boolean; stopping?: boolean },
): ChatRow[] {
  const sending = opts?.sending ?? false;
  const stopping = opts?.stopping ?? false;
  const rows: ChatRow[] = [];
  messages.forEach((message, index) => {
    const key = dayKey(message.at);
    const next = messages[index + 1];
    // Grouping resets at day boundaries even with no divider to separate
    // them: turns straddling midnight are one conversation in the data but
    // a jump in the reader's eye, so the tighter rhythm ends there.
    const grouped =
      next !== undefined && next.role === message.role && dayKey(next.at) === key;
    const isLast = index === messages.length - 1;
    rows.push({
      kind: "message",
      message,
      grouped,
      isActiveRun: isLast && message.streaming === true,
      status: deliveryStatus(message, next, sending && isLast),
    });
  });
  // The pending row anchors on the active run, not on a second read of
  // the messages: one predicate, or the two disagree about what streams.
  // While a stopped turn unwinds nothing is streaming, but the row must
  // still show — the stopping flag keeps it mounted (ticket 03).
  const tail = rows[rows.length - 1];
  const activeRun = tail !== undefined && tail.kind === "message" && tail.isActiveRun;
  if (activeRun || stopping) {
    rows.push({ kind: "pending", id: "pending" });
  }
  return rows;
}
