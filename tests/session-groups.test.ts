/** Session date grouping (C11): the pure bucketing seam.
 * Run: node --test tests/session-groups.test.ts
 *
 * PocketPal groups the sidebar into Pinned / Today / Yesterday / This
 * week / Last week / 2–4 weeks / Last month / Older
 * (ChatSessionStore.ts:1137 groupedSessions). Grouping must be DERIVED,
 * never stored — no schema change — and each group newest-first.
 *
 * Every test passes an explicit `now` so bucket boundaries are
 * deterministic instead of depending on the wall clock.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  groupSessions,
  sessionBucket,
} from "../lib/chat/session-groups.ts";
import type { ChatSession } from "../types/chat.ts";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
// A fixed local noon: date math below never crosses midnight.
const NOW = new Date(2026, 2, 11, 12, 0, 0).getTime();

function session(over: Partial<ChatSession> = {}): ChatSession {
  return { id: "s", title: "Chat", pinned: false, at: NOW, ...over };
}

describe("sessionBucket (C11)", () => {
  it("keeps today and yesterday by calendar day, not day-count", () => {
    // 11 hours before a fixed noon = 01:00 same day → today even though
    // a raw day-count would put it elsewhere.
    assert.equal(sessionBucket(NOW - 11 * HOUR, NOW), "today");
    // 11:00 the previous day → yesterday.
    assert.equal(sessionBucket(NOW - 13 * HOUR, NOW), "yesterday");
  });

  it("follows PocketPal's day thresholds for the rest", () => {
    // PocketPal: daysAgo = ceil((now - at) / day), <=6 thisWeek, <=13
    // lastWeek, then 2/3/4 weeks (merged here into one section), <=60
    // lastMonth, else older.
    assert.equal(sessionBucket(NOW - 6 * DAY, NOW), "thisWeek");
    assert.equal(sessionBucket(NOW - 7 * DAY, NOW), "lastWeek");
    assert.equal(sessionBucket(NOW - 13 * DAY, NOW), "lastWeek");
    assert.equal(sessionBucket(NOW - 14 * DAY, NOW), "twoToFourWeeks");
    assert.equal(sessionBucket(NOW - 34 * DAY, NOW), "twoToFourWeeks");
    assert.equal(sessionBucket(NOW - 35 * DAY, NOW), "lastMonth");
    assert.equal(sessionBucket(NOW - 60 * DAY, NOW), "lastMonth");
    assert.equal(sessionBucket(NOW - 61 * DAY, NOW), "older");
  });
});

describe("groupSessions (C11)", () => {
  const titles = (sessions: ChatSession[], now: number) =>
    groupSessions(sessions, now).map((s) => s.title);

  it("orders sections: Pinned, Today, Yesterday, This week, Last week, 2–4 weeks, Last month, Older", () => {
    const sessions: ChatSession[] = [
      session({ id: "old", at: NOW - 90 * DAY }),
      session({ id: "month", at: NOW - 40 * DAY }),
      session({ id: "recent", at: NOW - 20 * DAY }),
      session({ id: "lw", at: NOW - 10 * DAY }),
      session({ id: "tw", at: NOW - 3 * DAY }),
      session({ id: "y", at: NOW - 13 * HOUR }),
      session({ id: "t", at: NOW - HOUR }),
      session({ id: "p", pinned: true, at: NOW - 5 * DAY }),
    ];
    assert.deepEqual(titles(sessions, NOW), [
      "Pinned",
      "Today",
      "Yesterday",
      "This week",
      "Last week",
      "2–4 weeks",
      "Last month",
      "Older",
    ]);
  });

  it("hoists pinned into their own section, only when any exist", () => {
    const pinned = session({ id: "p", pinned: true, at: NOW - 2 * DAY });
    const sections = groupSessions([pinned], NOW);
    assert.deepEqual(
      sections.map((s) => s.title),
      ["Pinned"],
      "a pinned session leaves its date bucket",
    );
    assert.deepEqual(
      groupSessions([session({ id: "u" })], NOW).map((s) => s.title),
      ["Today"],
      "no pinned sessions → no Pinned section",
    );
  });

  it("keeps each group newest-first regardless of input order", () => {
    const sessions = [
      session({ id: "a", at: NOW - HOUR }),
      session({ id: "b", at: NOW - 2 * HOUR }),
      session({ id: "c", at: NOW - 3 * HOUR }),
    ];
    const [today] = groupSessions(sessions, NOW);
    assert.deepEqual(
      today.data.map((s) => s.id),
      ["a", "b", "c"],
    );
  });

  it("returns nothing for an empty list", () => {
    assert.deepEqual(groupSessions([], NOW), []);
  });
});

describe("SessionList wiring (C11)", () => {
  // Reads SessionList.tsx as text: the component needs react-native to
  // load, the pins only need its source.
  const src = read("components/chat/SessionList.tsx");

  it("renders sections, not a flat list", () => {
    assert.match(src, /<SectionList<ChatSession, SessionSection>/);
    assert.match(src, /groupSessions\(sessions\)/, "grouping derives from the prop");
    assert.doesNotMatch(src, /<FlatList/);
  });

  it("renders accessible headers and keeps selection + empty state", () => {
    assert.match(src, /renderSectionHeader=/);
    assert.match(src, /accessibilityRole="header"/, "headers must announce");
    assert.match(src, /extraData=\{\[sessionId, selected\]/, "current session stays visibly selected");
    assert.match(src, /No conversations yet\./, "today's empty state survives");
  });

  it("keeps long histories reachable under opaque sticky headers", () => {
    // The drawer has no outer scroll container, so a non-scrolling list
    // strands every row past the fold.
    assert.doesNotMatch(
      src,
      /scrollEnabled=\{false\}/,
      "the section list must scroll",
    );
    assert.match(src, /stickySectionHeadersEnabled/);
    // Opaque or the action buttons bleed through mid-scroll.
    assert.match(src, /className="bg-surface-1 px-5/);
  });
});
