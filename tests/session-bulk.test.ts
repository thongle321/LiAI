/** Multi-select bulk actions (C12): wiring pins.
 * Run: node --test tests/session-bulk.test.ts
 *
 * The drawer screen needs react-native to load, so this suite reads the
 * touched files as TEXT and pins the acceptance decisions:
 * explicit selection mode (not a gesture), per-row checkbox +
 * select-all, count-confirmed bulk delete, ONE export serializer path,
 * selection cleared on switch/close, and the mid-turn guard inherited
 * from the single-row delete.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("selection mode (C12)", () => {
  const src = read("components/chat/SessionList.tsx");

  it("has an explicit entry, not a long-press-only gesture", () => {
    assert.match(src, /Select conversations/, "a visible Select control");
    assert.doesNotMatch(src, /onLongPress/, "no gesture-only path");
  });

  it("offers a per-row checkbox and select-all", () => {
    assert.match(src, /accessibilityRole="checkbox"/);
    assert.match(src, /accessibilityState=\{\{ checked:/);
    assert.match(src, /Select all/);
  });

  it("exits without touching the single-row actions", () => {
    // Leaving selection restores pin/rename/delete exactly as they were.
    assert.match(src, /onTogglePin\(item\.id/, "the row actions still exist");
    assert.match(src, /accessibilityLabel="Done"/);
  });

  it("confirms bulk delete with an explicit count, never a generic ask", () => {
    assert.match(
      src,
      /Alert\.alert\(\s*`Delete \$\{[^}]+\} conversations\?`/,
      "the confirm carries the count in the question",
    );
    assert.doesNotMatch(src, /Are you sure/i);
    // A mid-turn row keeps itself: the confirmed count then disagrees
    // with what happened unless the difference is surfaced.
    assert.match(src, /deleted < ids\.length/, "skipped rows are reported");
  });

  it("clears selection on session switch and drawer close", () => {
    assert.match(
      src,
      /exitSelection\(\);\s*\}, \[sessionId\]\)/,
      "a switch wipes the selection",
    );
    assert.match(
      src,
      /drawerStatus === "closed"/,
      "closing the drawer wipes it too",
    );
  });

  it("sends the selected ids to the shared bulk actions", () => {
    assert.match(src, /onDeleteMany\(/);
    assert.match(src, /onExportSelected\(/);
  });
});

describe("one export path (C12)", () => {
  it("ChatMenu reads through the shared helper, not its own loop", () => {
    const menu = read("components/chat/ChatMenu.tsx");
    assert.match(menu, /readExportSessions\(/);
    assert.doesNotMatch(menu, /store\.get\(id\)/, "the second read loop is gone");
  });

  it("the drawer reuses toAllSessionsJson — no second serializer", () => {
    const drawer = read("components/AppDrawer.tsx");
    assert.match(drawer, /readExportSessions\(/);
    assert.match(drawer, /toAllSessionsJson\(/);
  });
});

describe("bulk delete guard (C12)", () => {
  const src = read("store/chat/sessions.ts");

  it("adds a deleteSessions action that routes through deleteSession", () => {
    assert.match(src, /\| "deleteSessions"/, "part of the slice contract");
    assert.match(src, /deleteSessions: async \(ids: string\[\]\)/);
    assert.match(src, /return deleted/, "the count comes back for reconciliation");
    // deleteSession already holds the mid-turn guard
    // (sending && sessionId === id), so looping through it preserves the
    // single-row path's behaviour for free.
    assert.match(
      src,
      /for \(const id of ids\)[\s\S]{0,120}?deleteSession\(id\)/,
      "per-id routing, guard included",
    );
  });

  it("AppDrawer wires the action", () => {
    assert.match(read("components/AppDrawer.tsx"), /deleteSessions\(/);
  });
});
