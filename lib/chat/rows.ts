/** Message-view rows: PocketPal-shaped derivation over our turns.
 *
 * The adapter the phase-1 port agreed on: the store keeps Zustand
 * `ChatMessage[]`, and this pure module derives everything the list needs
 * that the messages don't state — day dividers, group flags (avatar once
 * per group), the active run, and the user-turn status. View components
 * read rows, never re-derive.
 *
 * ponytail: no delivered/seen statuses — the store tracks sent only;
 * add when it tracks more.
 */

import type { ChatMessage } from "../../types/chat.ts";

export interface DateHeaderRow {
  kind: "date";
  id: string;
  label: string;
}

export interface MessageRow {
  kind: "message";
  message: ChatMessage;
  /** Next turn continues the group: hide this row's avatar, tighten corners. */
  grouped: boolean;
  /** Assistant row closing its group: the one avatar for the group. */
  showAvatar: boolean;
  /** Newest turn while tokens arrive: the pending row's anchor. */
  isActiveRun: boolean;
  /** User-turn delivery state; the error card owns error turns instead. */
  status: "sending" | "sent";
}

/** Active-run indicator (PocketPal PendingIndicator): the visual bottom of
 * the list while tokens arrive. Appended by the adapter — never stored. */
export interface PendingRow {
  kind: "pending";
  id: "pending";
}

export type ChatRow = DateHeaderRow | MessageRow | PendingRow;

function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(at: number, now: number): string {
  const day = 24 * 60 * 60 * 1000;
  const startOf = (t: number): number => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diffDays = Math.round((startOf(now) - startOf(at)) / day);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Rows for the list: a date header opening each day, then its turns. */
export function buildRows(
  messages: ChatMessage[],
  opts?: { now?: number; sending?: boolean },
): ChatRow[] {
  const now = opts?.now ?? Date.now();
  const sending = opts?.sending ?? false;
  const rows: ChatRow[] = [];
  let lastDay = "";
  messages.forEach((message, index) => {
    const key = dayKey(message.at);
    if (key !== lastDay) {
      lastDay = key;
      rows.push({ kind: "date", id: `date-${key}`, label: dayLabel(message.at, now) });
    }
    const next = messages[index + 1];
    // Grouping resets at day boundaries: a date header between two
    // same-role turns ends the group, or the divider would sit inside it.
    const grouped =
      next !== undefined && next.role === message.role && dayKey(next.at) === key;
    const isLast = index === messages.length - 1;
    rows.push({
      kind: "message",
      message,
      grouped,
      showAvatar: message.role === "assistant" && !grouped,
      isActiveRun: isLast && message.streaming === true,
      status: sending && isLast && message.role === "user" ? "sending" : "sent",
    });
  });
  // The pending row anchors on the active run, not on a second read of
  // the messages: one predicate, or the two disagree about what streams.
  const tail = rows[rows.length - 1];
  if (tail !== undefined && tail.kind === "message" && tail.isActiveRun) {
    rows.push({ kind: "pending", id: "pending" });
  }
  return rows;
}
