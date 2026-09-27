/** Message-view rows adapter (pure). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRows } from "../lib/chat/rows.ts";
import type { ChatMessage } from "../types/chat.ts";

function user(text: string, at: number): ChatMessage {
  return { id: `u-${text}`, role: "user", text, at };
}

function assistant(text: string, at: number, extra?: Partial<ChatMessage>): ChatMessage {
  return { id: `a-${text}`, role: "assistant", text, at, ...extra };
}

// Local-time constructor: day-boundary expectations stay TZ-safe.
function atMidday(year: number, month: number, date: number): number {
  return new Date(year, month - 1, date, 12).getTime();
}

describe("buildRows", () => {
  it("returns no rows for an empty conversation", () => {
    assert.deepEqual(buildRows([]), []);
  });

  it("opens with a Today header, then the message ungrouped and sent", () => {
    const at = atMidday(2026, 9, 27);
    const message = user("hi", at);
    assert.deepEqual(buildRows([message], { now: atMidday(2026, 9, 27) }), [
      { kind: "date", id: "date-2026-9-27", label: "Today" },
      {
        kind: "message",
        message,
        grouped: false,
        showAvatar: false,
        isActiveRun: false,
        status: "sent",
      },
    ]);
  });

  it("groups adjacent same-role turns, avatar only on the group's last assistant row", () => {
    const now = atMidday(2026, 9, 27);
    const q = user("q", now);
    const first = assistant("one", now);
    const second = assistant("two", now);
    const rows = buildRows([q, first, second], { now });
    assert.equal(rows.length, 4); // header + 3 turns, same day
    assert.deepEqual(rows[1], {
      kind: "message",
      message: q,
      grouped: false,
      showAvatar: false,
      isActiveRun: false,
      status: "sent",
    });
    assert.deepEqual(rows[2], {
      kind: "message",
      message: first,
      grouped: true,
      showAvatar: false,
      isActiveRun: false,
      status: "sent",
    });
    assert.deepEqual(rows[3], {
      kind: "message",
      message: second,
      grouped: false,
      showAvatar: true,
      isActiveRun: false,
      status: "sent",
    });
  });

  it("opens a new dated header when the day changes", () => {
    const rows = buildRows(
      [user("yesterday", atMidday(2026, 9, 26)), user("today", atMidday(2026, 9, 27))],
      { now: atMidday(2026, 9, 27) },
    );
    assert.deepEqual(
      rows.map((r) => (r.kind === "date" ? r.label : r.message.text)),
      ["Yesterday", "yesterday", "Today", "today"],
    );
  });

  it("marks only the newest streaming turn as the active run", () => {
    const now = atMidday(2026, 9, 27);
    const rows = buildRows(
      [assistant("done", now, { streaming: false }), assistant("live", now, { streaming: true })],
      { now },
    );
    const flags = rows
      .filter((r) => r.kind === "message")
      .map((r) => (r.kind === "message" ? r.isActiveRun : null));
    assert.deepEqual(flags, [false, true]);
  });

  it("appends a pending row while the newest turn streams", () => {
    const now = atMidday(2026, 9, 27);
    const rows = buildRows(
      [user("q", now), assistant("live", now, { streaming: true })],
      { now },
    );
    assert.deepEqual(rows[rows.length - 1], { kind: "pending", id: "pending" });
  });

  it("appends no pending row once the turn settles", () => {
    const now = atMidday(2026, 9, 27);
    const rows = buildRows([user("q", now), assistant("done", now)], { now });
    assert.equal(
      rows.some((r) => r.kind === "pending"),
      false,
    );
  });

  it("resets grouping at day boundaries", () => {
    const late = new Date(2026, 8, 26, 23, 58).getTime();
    const early = new Date(2026, 8, 27, 0, 2).getTime();
    const rows = buildRows([assistant("late", late), assistant("early", early)], {
      now: early,
    });
    assert.deepEqual(
      rows.map((r) => (r.kind === "date" ? r.label : r.kind)),
      ["Yesterday", "message", "Today", "message"],
    );
    assert.deepEqual(
      rows.filter((r) => r.kind === "message").map((r) => r.kind === "message" && r.grouped),
      [false, false],
    );
  });

  it("shows the newest user turn as sending while the store sends", () => {
    const now = atMidday(2026, 9, 27);
    const q = user("q", now);
    const rows = buildRows([q, assistant("a", now)], { now, sending: true });
    assert.equal(
      rows.find((r) => r.kind === "message" && r.message.id === q.id)?.status,
      "sent",
    );
    const solo = buildRows([q], { now, sending: true });
    assert.equal(
      solo.find((r) => r.kind === "message")?.status,
      "sending",
    );
  });
});
