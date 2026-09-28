/** Geometry for the shared bottom sheet.
 *
 * Pure and separate from the component because this arithmetic is the one
 * thing about the sheet that can silently regress to "covers the status
 * bar" — and node can check it, which it cannot do for pixels. See
 * tests/sheet.test.ts.
 */

/** Gap between the bottom of the status bar and the top of a tall sheet. */
export const SHEET_TOP_GAP = 16;

/**
 * A sheet shorter than this is unusable, and the arithmetic below can ask
 * for less on a very short window (a large inset in landscape, or a tiny
 * split-screen window). Height is in dp, so this is a real sheet, not a
 * sliver.
 */
const MIN_SHEET_HEIGHT = 120;

/**
 * The tallest the sheet may be, so that a full-height sheet's top edge
 * lands below the status bar rather than behind it.
 *
 * PocketPal derives the same cap (screenHeight - insets.top - 16) and
 * anchors the sheet to the bottom, which is what puts their content just
 * under the status bar.
 *
 * No topEdge helper: with the sheet bottom-anchored, the top edge is just
 * windowHeight minus this value, and a test asserting that subtraction is
 * restating the definition rather than pinning a behaviour.
 */
export function sheetMaxHeight(windowHeight: number, insetsTop: number): number {
  return Math.max(MIN_SHEET_HEIGHT, windowHeight - insetsTop - SHEET_TOP_GAP);
}
