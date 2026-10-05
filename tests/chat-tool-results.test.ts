/** Tool-call result surfaces (audit G5, ticket 01).
 *
 * Source-scanned, like the menu-ordering and thinking-pill guards: the
 * regression this prevents is STRUCTURAL -- an error falling through to the
 * "used X" chip -- and no rendering assertion would notice it fail quietly.
 *
 * Run: node --test tests/chat-tool-results.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Repo-relative, block comments stripped so a rule can never be satisfied
 *  by prose describing it. */
function read(file: string): string {
  return readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

const row = read("components/chat/MessageListItem.tsx");
const block = read("components/chat/ToolErrorBlock.tsx");

test("a failed tool call renders an error, never the chip", () => {
  // The whole point of the discriminant. If this ever flips back, a failed
  // web_search looks identical to a successful one and the model answering
  // around a failure becomes indistinguishable from the model changing its
  // mind -- which is the bug this ticket exists to kill.
  const errorAt = row.indexOf("step.ok === false");
  const chipAt = row.indexOf("<Wrench");
  assert.ok(errorAt > -1, "the error branch exists");
  assert.ok(chipAt > -1, "the chip still exists for the rest");
  assert.ok(errorAt < chipAt, "error is dispatched BEFORE the chip");
});

test("only a recorded FAILURE is styled as one", () => {
  // `ok === false`, not `!ok`: undefined means "never recorded" (a row
  // written before the discriminant existed). Treating that as a failure
  // would paint every old conversation's tool calls red.
  assert.match(row, /step\.ok === false/);
  assert.doesNotMatch(row, /!step\.ok\b/, "undefined is not failure");
});

test("the error block names the tool and pairs a glyph with a word", () => {
  assert.match(block, /\{tool\} failed/, "names which capability failed");
  assert.match(block, /<AlertTriangle/, "a glyph, so state is not colour-alone");
  assert.match(block, /accessibilityLiveRegion="polite"/);
  assert.match(block, /text-error/, "the token, not a hardcoded colour");
});

test("the error surface is not interactive, so long-press still reaches the menu", () => {
  // The bubble's menu wraps the tool surfaces. If the error block became a
  // Pressable it would claim the gesture and the message menu would stop
  // opening on any turn that used a failing tool.
  assert.doesNotMatch(block, /<Pressable|onPress/);
});

test("persistence is additive: absence reads as unknown, not success", () => {
  const store = read("lib/chat/tinybase-store.ts");
  assert.match(store, /step\.ok !== undefined \? \{ ok: step\.ok \}/);
  assert.match(store, /typeof raw\["ok"\] === "boolean" \? \{ ok: raw\["ok"\] \}/);
});

test("the chat screen resolves surfaces by NAME, not by hardcoding tools", () => {
  // A fifth tool must be a registration, not an edit to the bubble.
  assert.match(row, /toolSurfaceFor\(step\.tool\)/);
  const surfaces = read("components/chat/toolSurfaces.tsx");
  assert.match(surfaces, /registerToolSurface\("web_search"/);
  assert.match(surfaces, /export function registerToolSurface/);
});

test("dispatch order holds: error, then registered renderer, then chip", () => {
  // The regression that matters: an error reaching a renderer or the chip
  // is exactly how a failed tool looked like a successful one.
  const errorAt = row.indexOf("step.ok === false");
  const rendererAt = row.indexOf("toolSurfaceFor(step.tool)");
  const chipAt = row.indexOf("<Wrench");
  assert.ok(errorAt > -1 && rendererAt > -1 && chipAt > -1, "all three exist");
  assert.ok(errorAt < rendererAt, "error is checked BEFORE the renderer");
  assert.ok(rendererAt < chipAt, "the renderer is consulted BEFORE the chip");
});

test("a surface opens a SHEET, not an inline expansion", () => {
  // Read from pocketpal's WebSearchResultBubble: a collapsed row that
  // opens a bottom sheet. There is no inline expanded state at all, which
  // is exactly why there was never anything to "tap outside" to collapse.
  const surfaces = read("components/chat/toolSurfaces.tsx");
  assert.doesNotMatch(
    surfaces,
    /accessibilityState=\{\{ expanded \}\}/,
    "no inline expansion means no expanded state to expose",
  );
  assert.match(surfaces, /<Sheet visible=\{open\}/);
  assert.match(surfaces, /onRequestClose=\{onDismiss\}/, "Android back dismisses");
  assert.match(surfaces, /onPress=\{onDismiss\}/, "tapping the scrim dismisses");
});

test("the trigger row meets the touch floor and names its action", () => {
  const surfaces = read("components/chat/toolSurfaces.tsx");
  assert.match(surfaces, /accessibilityRole="button"/);
  assert.match(surfaces, /accessibilityHint="Opens the full result"/);
  assert.match(surfaces, /min-h-12/, "48dp on the whole row");
  assert.match(surfaces, /hitSlop=\{\{ top: 12, bottom: 12 \}\}/);
});

test("hits are read structured, never re-parsed out of the markdown", () => {
  const surfaces = read("components/chat/toolSurfaces.tsx");
  assert.match(surfaces, /step\.data\?\.hits/);
  assert.doesNotMatch(surfaces, /\bisVision|\\n-\s|## Web search results/);
});

test("all four talents have a registered surface, so none falls to the chip", () => {
  const surfaces = read("components/chat/toolSurfaces.tsx");
  for (const name of ["web_search", "read_url", "calculate", "datetime"]) {
    assert.match(
      surfaces,
      new RegExp(`registerToolSurface\\("${name}"`),
      `${name} has a surface`,
    );
  }
});

test("truncation is reported by the seam, never inferred from a length", () => {
  // A renderer deciding `length === 6000` silently starts lying the day the
  // cap moves, and the notice is the whole difference between a cut-off
  // article and the whole thing.
  const registry = read("lib/agent/registry.ts");
  assert.match(registry, /truncated: cleaned\.length > READ_CAP/);
  const surfaces = read("components/chat/toolSurfaces.tsx");
  assert.match(surfaces, /step\.data\?\.truncated === true/);
  // The CAP ITSELF must not appear here. A `//` comment explaining why we
  // avoid this would otherwise trip it, so assert the literal is absent --
  // which is the real rule: the renderer cannot know the cap.
  assert.doesNotMatch(surfaces, /6000/, "the cap is not duplicated here");
});

test("a surface with nothing to expand is a STATIC row with no control", () => {
  // pocketpal's ToolUsedChip is a plain View for the same reason.
  const surfaces = read("components/chat/toolSurfaces.tsx");
  const row = surfaces.slice(
    surfaces.indexOf("function StaticRow"),
    surfaces.indexOf("function Sheet"),
  );
  assert.doesNotMatch(
    row,
    /Pressable|onPress|accessibilityRole="button"/,
    "nothing to expand means nothing to press",
  );
});

test("zero results is static, and the count survives a long query", () => {
  const surfaces = read("components/chat/toolSurfaces.tsx");
  assert.match(
    surfaces,
    /if \(hits\.length === 0\) \{\s*return <StaticRow label=\{`No results for /,
    "an expandable empty list is worse than saying so",
  );
  // Split so a long query truncates but the count never does.
  assert.match(surfaces, /count=\{hits\.length === 1 \? "· 1 result"/);
});