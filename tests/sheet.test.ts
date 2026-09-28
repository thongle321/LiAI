/** Sheet geometry, the one piece of this the node tests can actually pin.
 *
 * The sheet is bottom-anchored and capped, so its top edge is
 * windowHeight - maxHeight. PocketPal derives the same cap
 * (Sheet.tsx:100-102: screenHeight - insets.top - 16), which is why their
 * sheet's content starts just under the status bar instead of behind it.
 *
 * Run: node --test tests/sheet.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SHEET_TOP_GAP, sheetMaxHeight } from "../lib/sheet.ts";

const WINDOW = 2392; // device px, the height adb reports

describe("sheet height", () => {
  it("caps the sheet at the window less the status bar and the gap", () => {
    // The whole point, and the reason the sheet stopped covering the status
    // bar: a tall sheet's top edge is this cap measured from the bottom, so
    // it lands at insets.top + SHEET_TOP_GAP. Changing the 16 without
    // deciding to is exactly what this fails on.
    const insets = 88;
    assert.equal(sheetMaxHeight(WINDOW, insets), WINDOW - insets - SHEET_TOP_GAP);
  });

  it("handles a zero top inset, as on a device with no cutout", () => {
    assert.equal(sheetMaxHeight(WINDOW, 0), WINDOW - SHEET_TOP_GAP);
  });

  it("still returns a usable sheet on a window shorter than the inset", () => {
    // A divided-screen or landscape window can be shorter than the inset
    // plus the gap. A cap of 1 would technically clear the assertion above
    // and render an unusable sliver, so the floor is what is being pinned.
    assert.ok(
      sheetMaxHeight(200, 88) >= 120,
      "a tiny window must still get a sheet you can use",
    );
    assert.equal(sheetMaxHeight(200, 500), sheetMaxHeight(200, 88));
  });
});
