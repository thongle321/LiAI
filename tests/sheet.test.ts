/** Sheet geometry, the one piece of this the node tests can actually pin.
 *
 * The sheet is bottom-anchored and capped, so its top edge is
 * windowHeight - maxHeight. PocketPal derives the same cap
 * (Sheet.tsx:100-102: screenHeight - insets.top - 16), which is why their
 * sheet's content starts just under the status bar instead of behind it.
 *
 * The 16 is written out here rather than imported on purpose. Importing it
 * would make this assert window - insets - GAP === window - insets - GAP,
 * which passes for any value at all — the previous version of this file did
 * exactly that while its comment claimed it caught a change to the 16.
 *
 * Run: node --test tests/sheet.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sheetMaxHeight } from "../lib/sheet.ts";

const WINDOW = 2392; // device px, the height adb reports
const INSETS = 88; // the status bar on that device

describe("sheet height", () => {
  it("caps the sheet so its top edge lands below the status bar", () => {
    // The whole point. Bottom-anchored, so the top edge is the cap measured
    // from the bottom: window - (window - insets - 16) = insets + 16, which
    // is the gap under the status bar.
    assert.equal(sheetMaxHeight(WINDOW, INSETS), WINDOW - INSETS - 16);
  });
});
