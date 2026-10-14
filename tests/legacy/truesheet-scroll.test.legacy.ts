/** TrueSheet scroll-ownership invariants (components/Sheet.tsx).
 *
 * Two native defaults fight a content-sized sheet, and both were fixed by
 * configuration rather than by code. A source-level guard is the only seam
 * available: the behavior lives in Kotlin/ObjC that node cannot run, but
 * the PROPS we hand it are ours, and these two are the pair that regressed:
 *
 *  1. `scrollingExpandsSheet` defaults to TRUE. True means the scroll
 *     gesture is the sheet's: Android's TrueSheetBottomSheetBehavior.kt
 *     consumes the nested scroll (onNestedPreScroll) and swallows the fling
 *     (onNestedFling), so content neither scrolls nor coasts; iOS sets
 *     prefersScrollingExpandsWhenScrolledToEdge (TrueSheetViewController.mm).
 *     With detents={["auto"]} there is no taller detent to grow into, so the
 *     gesture only MOVES the sheet — the reported "scrolling scrolls the
 *     sheet, not the content".
 *  2. `scrollable` must stay OFF. In v3 it puts flex:1 on the content view
 *     inside an absolute-fill container (TrueSheet.js), so the 'auto' detent
 *     measures the screen and every sheet opens near-full. That is a
 *     separate bug, already fixed once; this test keeps it fixed.
 *
 * The CHROME arrangement is pinned in tests/sheet.test.ts, not here: the
 * header and the action bar are plain in-flow children of the sheet's
 * content view (PocketPal's Sheet.tsx + Actions.tsx), so nothing about
 * them is a native prop and there is nothing for this file to guard.
 * Earlier this note claimed the reverse and required a native `footer`
 * prop; that reversal, and the Kotlin math that settled it
 * (TrueSheetDetentCalculator.kt ignores footerHeight in the 'auto'
 * branch, so an absolute footer needs a measured reserve a lift over the
 * keyboard), is recorded there.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("components/Sheet.tsx", "utf8");

describe("TrueSheet scroll ownership", () => {
  it("tells the native sheet that scrolling belongs to the content", () => {
    assert.match(
      src,
      /scrollableOptions=\{\{[^}]*scrollingExpandsSheet:\s*false/,
      "scrollableOptions.scrollingExpandsSheet must be false — its default (true) hands scroll gestures to the sheet and eats the fling",
    );
  });

  it("still does not pass the `scrollable` prop to TrueSheet", () => {
    // Only the LOCAL `scrollable` prop may appear (it picks ScrollView vs
    // View for the body). Passing it THROUGH to TrueSheet breaks the
    // 'auto' detent, which is why the wrapper deliberately omits it.
    assert.doesNotMatch(
      src,
      /<TrueSheet[^>]*\bscrollable\b/,
      "the `scrollable` prop must not reach TrueSheet: flex:1 + absoluteFill makes auto measure the screen",
    );
  });

  it("keeps one content-sized detent", () => {
    assert.match(src, /detents=\{\["auto"\]\}/, "sheets stay content-sized");
  });
});