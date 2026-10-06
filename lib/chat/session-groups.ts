/** Session date grouping (C11): derived, never stored.
 *
 * Sections mirror PocketPal's sidebar buckets (ChatSessionStore
 * groupedSessions) with its separate 2/3/4-week buckets merged into the
 * single "2–4 weeks" section this issue asks for. Day thresholds follow
 * PocketPal: daysAgo = ceil((now - at) / day), today/yesterday decided
 * by calendar day first so a raw day-count cannot misfile them.
 *
 * Pure on purpose: the drawer keeps its own state, no schema changes,
 * and the whole thing runs in plain node tests.
 */

import type { ChatSession } from "../../types/chat.ts";

const DAY = 86_400_000;

export type SessionBucket =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "twoToFourWeeks"
  | "lastMonth"
  | "older";

export interface SessionSection {
  title: string;
  data: ChatSession[];
}

const BUCKET_TITLES: Record<SessionBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  lastWeek: "Last week",
  twoToFourWeeks: "2–4 weeks",
  lastMonth: "Last month",
  older: "Older",
};

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Which section a timestamp belongs to. `now` is the test seam: every
 *  boundary test passes it explicitly instead of racing the clock. */
export function sessionBucket(at: number, now: number = Date.now()): SessionBucket {
  const date = new Date(at);
  const current = new Date(now);
  if (sameCalendarDay(date, current)) return "today";
  // Date-normalized so DST cannot make "yesterday" land two days back.
  const yesterday = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() - 1,
  );
  if (sameCalendarDay(date, yesterday)) return "yesterday";

  const daysAgo = Math.ceil((now - at) / DAY);
  if (daysAgo <= 6) return "thisWeek";
  if (daysAgo <= 13) return "lastWeek";
  if (daysAgo <= 34) return "twoToFourWeeks";
  if (daysAgo <= 60) return "lastMonth";
  return "older";
}

/** The drawer's history as ordered sections: Pinned (when any), then
 *  date buckets newest-first, every group newest-first by `at`. */
export function groupSessions(
  sessions: ChatSession[],
  now: number = Date.now(),
): SessionSection[] {
  const byNewest = (a: ChatSession, b: ChatSession) => b.at - a.at;
  const sections: SessionSection[] = [];

  const pinned = sessions.filter((s) => s.pinned).sort(byNewest);
  if (pinned.length > 0) sections.push({ title: "Pinned", data: pinned });

  const buckets = new Map<SessionBucket, ChatSession[]>();
  for (const s of sessions) {
    if (s.pinned) continue;
    const bucket = sessionBucket(s.at, now);
    const group = buckets.get(bucket);
    if (group) group.push(s);
    else buckets.set(bucket, [s]);
  }
  // Section order = BUCKET_TITLES' own key order (single source).
  for (const bucket of Object.keys(BUCKET_TITLES) as SessionBucket[]) {
    const group = buckets.get(bucket);
    if (group) sections.push({ title: BUCKET_TITLES[bucket], data: group.sort(byNewest) });
  }
  return sections;
}
