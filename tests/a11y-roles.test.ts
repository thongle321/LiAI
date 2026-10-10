/** Pressables that carry text must announce as buttons (Part 2 audit, P2).
 *
 * WHY A SOURCE SCAN: the repo's a11y guard tests (touch-targets,
 * font-scale) are source scans too — they cannot render, but they CAN
 * pin the exact regression this fixes: six text-bearing pressables had
 * no accessibilityRole/Label, so a screen reader announced them as
 * plain content (the vision screen's primary "Open settings" CTA
 * included). A role that gets deleted breaks this test.
 *
 * Run: node --test tests/a11y-roles.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/** The props on one Pressable, from its `onPress=` to the tag's `>`.
 *  The tag end is the first `>` NOT preceded by `=`: an arrow function
 *  in a prop (`onPress={() => void openSettings()}`) carries its own
 *  `>` and would end the block early. */
function pressableBlock(source: string, anchor: string): string {
  const at = source.indexOf(anchor);
  assert.ok(at >= 0, `anchor not found: ${anchor}`);
  const close = /[^=]>/.exec(source.slice(at));
  assert.ok(close, `tag end not found after: ${anchor}`);
  return source.slice(at, at + close.index + 1);
}

describe("text-as-button pressables announce as buttons", () => {
  it("vision denied-permission CTA: Open settings", () => {
    const block = pressableBlock(
      read("components/VisionOverlays.tsx"),
      'onPress={onOpenSettings} className="btn btn--primary mt-4"',
    );
    assert.match(block, /accessibilityRole="button"/);
    assert.match(block, /accessibilityLabel="Open settings"/);
  });

  it("vision bottom-panel settings issue line", () => {
    const block = pressableBlock(
      read("components/VisionOverlays.tsx"),
      "onPress={onOpenSettings}\n                onPressIn={settingsPress.onPressIn}",
    );
    assert.match(block, /accessibilityRole="button"/);
    assert.match(block, /accessibilityLabel=/);
  });

  it("voice screen settings issue line", () => {
    const block = pressableBlock(
      read("app/(drawer)/(tabs)/voice.tsx"),
      "onPress={() => void openSettings()}",
    );
    assert.match(block, /accessibilityRole="button"/);
    assert.match(block, /accessibilityLabel=/);
  });

  it("chat attach-menu rows (PlusItem)", () => {
    const block = pressableBlock(
      read("components/chat/MessageInput.tsx"),
      // The JSX anchor, not `function PlusItem(`: the signature contains
      // `() => void`, whose ">" ends the block before the tag.
      'onPress={onPress}\n      className="flex-row items-center gap-3 px-5 py-2"',
    );
    assert.match(block, /accessibilityRole="button"/);
    assert.match(block, /accessibilityLabel=\{label\}/);
  });

  it("models preset-card expand header reports its expanded state", () => {
    const block = pressableBlock(
      read("components/models/AvailableModels.tsx"),
      "onPress={() => setExpanded(!expanded)}",
    );
    assert.match(block, /accessibilityRole="button"/);
    assert.match(block, /accessibilityLabel=\{preset\.name\}/);
    assert.match(block, /accessibilityState=\{\{ expanded/);
  });

  it("tool-results sheet panel", () => {
    const block = pressableBlock(
      read("components/chat/toolSurfaces.tsx"),
      'accessibilityLabel="Results"',
    );
    assert.match(block, /accessibilityRole="button"/);
  });
});
