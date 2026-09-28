/** Geometry for the shared bottom sheet.
 *
 * Pure and separate from the component because this arithmetic is the one
 * thing about the sheet that can silently regress to "covers the status
 * bar" — and node can check it, which it cannot do for pixels. See
 * tests/sheet.test.ts.
 */

/**
 * Gap between the bottom of the status bar and the top of a tall sheet.
 * PocketPal's value (Sheet.tsx:100-102). Deliberately not exported: the
 * only consumer would be the test, and a test that imports this constant
 * restates sheetMaxHeight's own definition and passes on any change to it.
 */
const SHEET_TOP_GAP = 16;

/**
 * The tallest the sheet may be, so that a full-height sheet's top edge
 * lands below the status bar rather than behind it.
 *
 * PocketPal derives the same cap (screenHeight - insets.top - 16) and
 * anchors the sheet to the bottom, which is what puts their content just
 * under the status bar.
 */
export function sheetMaxHeight(windowHeight: number, insetsTop: number): number {
  // The floor only keeps this a valid length if a window is somehow
  // shorter than its inset plus the gap. No phone produces that, and there
  // is no minimum sheet height worth designing for.
  return Math.max(1, windowHeight - insetsTop - SHEET_TOP_GAP);
}
