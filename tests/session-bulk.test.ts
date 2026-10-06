/** Multi-select bulk actions (C12): wiring pins.
 * Run: node --test tests/session-bulk.test.ts
 *
 * The drawer screen needs react-native to load, so this suite reads the
 * touched files as TEXT and pins the acceptance decisions:
 * long-press menu as the entry (PocketParity), a LEADING per-row
 * checkbox + a full-width Select All row, count-confirmed bulk delete,
 * ONE export serializer path, selection that SURVIVES drawer close and
 * session switch, and the mid-turn guard inherited from the single-row
 * delete.
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

  it("enters through the long-press menu, not a header button", () => {
    // PocketParity (SidebarContent.tsx:184-192): the row menu carries a
    // "Select..." item, and there is NO always-visible Select control.
    assert.match(src, /onLongPress/, "the row menu is gesture-entered");
    assert.match(src, /label="Select\.\.\."/, "the menu item that starts it");
    assert.doesNotMatch(
      src,
      /accessibilityLabel="Select conversations"/,
      "no always-visible Select button in the header",
    );
    assert.match(
      src,
      /setSelected\(new Set\(\[id\]\)\);\s*setSelecting\(true\)/,
      "the long-pressed row is already selected when mode opens",
    );
  });

  it("offers a LEADING per-row checkbox and a full-width Select All row", () => {
    assert.match(src, /accessibilityRole="checkbox"/);
    assert.match(src, /accessibilityState=\{\{ checked:/);
    // A full-width row under the header (SelectAllRow), not a header control.
    assert.match(src, />\s*Select All\s*</);
    assert.match(src, /className="flex-row items-center px-5 py-3"/);
  });

  it("keeps the row's single-row actions in the menu", () => {
    // Pin/Rename/Delete moved into the long-press menu; the row carries
    // only the pin star. The menu is absent while selecting.
    assert.match(src, /label=\{menuSession\.pinned \? "Unpin" : "Pin"\}/);
    assert.match(src, /label="Rename"/);
    assert.match(src, /label="Delete"/);
    assert.doesNotMatch(
      src,
      /onTogglePin\(item\.id/,
      "the row no longer carries a Pin button",
    );
    assert.match(src, /accessibilityLabel="Cancel selection"/, "Cancel, not Done");
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

  it("keeps the selection across drawer close and session switch", () => {
    // PocketParity: selection is store state there and survives the panel
    // closing. Two exits only — Cancel, and a completed bulk action.
    assert.doesNotMatch(
      src,
      /drawerStatus/,
      "nothing wipes the selection when the drawer closes",
    );
    assert.doesNotMatch(
      src,
      /exitSelection\(\);\s*\}, \[sessionId\]\)/,
      "nor on a session switch",
    );
    assert.match(src, /onPress=\{exitSelection\}/, "Cancel is the way out");
    assert.match(
      src,
      /if \(error !== null\) setNotice\(error\);[\s\S]{0,200}?else exitSelection\(\);/,
      "a completed export also leaves the mode",
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

  it("the drawer reuses the single-session serializer — no second format", () => {
    // PocketParity: one file PER conversation, so the shared path is
    // toSessionJson (ChatMenu's single export), not a bundle serializer.
    const drawer = read("components/AppDrawer.tsx");
    assert.match(drawer, /readExportSessions\(/);
    assert.match(drawer, /toSessionJson\(/);
    assert.doesNotMatch(drawer, /toAllSessionsJson\(/, "the bundle is gone");
    // Sequential: a second share sheet opened over an open one is dropped.
    assert.match(drawer, /for \(const id of ids\)[\s\S]{0,400}?await shareExportedFile\(/);
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
