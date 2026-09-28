/** Chat overflow menu: structure guards.
 *
 * A source scan, not a render test — the failure these prevent is a
 * structural one (an item moved, a gate dropped, a fourth header control
 * squeezed in) that no rendering assertion would notice. Same pattern as
 * tests/touch-targets.test.ts and tests/settings-pattern.test.ts.
 *
 * Run: node --test tests/chat-menu.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const MENU = read("components/chat/ChatMenu.tsx");
const CHAT = read("app/(drawer)/(tabs)/chat.tsx");

/** The label of every top-level MenuRow, in the order it appears. */
function menuLabels(): string[] {
  const panel = MENU.slice(
    MENU.indexOf('{panel === "menu"'),
    MENU.indexOf('{panel === "model"'),
  );
  return [...panel.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
}

describe("chat menu", () => {
  it("keeps PocketPal's order", () => {
    assert.deepEqual(menuLabels(), [
      "Generation settings",
      "Model",
      "Duplicate chat history",
      "Rename",
      "Delete",
      "Export",
    ]);
  });

  it("gates the conversation actions on a session existing", () => {
    // A brand-new unsent conversation has no session id, so all three
    // would be dead rows. PocketPal gates the same three.
    assert.ok(
      MENU.includes("const hasSession = sessionId !== null;"),
      "the gate must be explicit",
    );
    const panel = MENU.slice(
      MENU.indexOf('{panel === "menu"'),
      MENU.indexOf('{panel === "model"'),
    );
    const gate = panel.indexOf("hasSession ? (");
    for (const label of ["Duplicate chat history", "Rename", "Delete"]) {
      const at = panel.indexOf(`label="${label}"`);
      assert.ok(at > gate, `${label} must live inside the hasSession gate`);
    }
  });

  it("keeps Delete destructive", () => {
    // Delete now exists in two places (here and the drawer), so this is
    // the one that must not quietly become a plain row.
    assert.match(MENU, /label="Delete"[\s\S]{0,200}destructive/);
  });

  it("offers export without claiming an import it does not have", () => {
    assert.match(MENU, /label="Export"/);
    assert.doesNotMatch(
      MENU,
      /Export\/Import/,
      "there is no import parser; the label must not promise one",
    );
  });

  it("drills in rather than floating a measured submenu", () => {
    assert.ok(MENU.includes('panel === "model"'));
    assert.ok(MENU.includes('panel === "export"'));
    assert.doesNotMatch(
      MENU,
      /measure\(\)/,
      "a drill-in needs no measurement; a floating submenu does",
    );
  });
});

describe("chat header", () => {
  it("has exactly three trailing controls, so w-36 stays correct", () => {
    // The geometry: 360px screen - px-5 (40px) = 320px, and DESIGN.md
    // requires BOTH header slots equal to the wider group. A fourth
    // 48dp control needs w-48 (192px) per side = 384px of 320, so it
    // cannot fit. Counted as 48dp targets, not labels: two of the three
    // carry conditional labels, and the invariant is about space.
    const lines = CHAT.split(/\r?\n/);
    const start = lines.findIndex((l) => l.includes("h-14 flex-row items-center border-b"));
    assert.ok(start > -1, "the chat header must still exist");
    // The header row is followed by the search bar, so that is its end.
    // (Not `className="flex-1"`: the wordmark inside the header is one.)
    const end = lines.findIndex((l, i) => i > start && l.includes("{searchOpen && ("));
    assert.ok(end > start, "the header must end before the search bar");
    const header = lines.slice(start, end).join("\n");
    // The trailing group is three controls: search, copy, and the menu.
    // The menu's own 48dp trigger lives in ChatMenu.tsx, not here, so this
    // file holds the drawer plus two trailing targets.
    const targets = [...header.matchAll(/className="h-12 w-12/g)].length;
    assert.equal(
      targets,
      3,
      `expected 3 targets in the chat route (drawer, search, copy), found ${targets}`,
    );
    // ...and the menu supplies the third, at the same size. Together that
    // is the three-control trailing group w-36 was sized for.
    const menuTriggers = [...MENU.matchAll(/className="h-12 w-12/g)].length;
    assert.equal(
      menuTriggers,
      1,
      `the menu must have exactly one 48dp trigger, found ${menuTriggers}`,
    );
  });

  it("wires the menu's first item to the generation sheet", () => {
    assert.match(
      CHAT,
      /<ChatMenu onOpenGeneration=\{\(\) => setGenerationOpen\(true\)\} \/>/,
    );
    assert.doesNotMatch(
      CHAT,
      /SlidersHorizontal/,
      "the bare slider was replaced by the menu's first item",
    );
  });
});
