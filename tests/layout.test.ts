/** Tablet content-column cap (DESIGN.md Responsive behaviour).
 *
 * The app is adaptive and `supportsTablet: true`, so on a wide viewport a
 * full-bleed card column stretches to ~600px. DESIGN.md requires capping at
 * a reading measure and centring instead. Pure + tested — no UI seam.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CONTENT_MAX_WIDTH, contentColumnWidth } from "../lib/layout.ts";

describe("contentColumnWidth", () => {
  it("leaves phone widths untouched", () => {
    assert.equal(contentColumnWidth(390), 390);
  });

  it("caps and centres on a tablet width", () => {
    // A 1024pt tablet must not draw 1024pt-wide cards.
    assert.equal(contentColumnWidth(1024), CONTENT_MAX_WIDTH);
  });

  it("caps a very wide viewport too", () => {
    assert.equal(contentColumnWidth(1600), CONTENT_MAX_WIDTH);
  });

  it("respects the exact cap boundary (no centring jitter)", () => {
    assert.equal(contentColumnWidth(CONTENT_MAX_WIDTH), CONTENT_MAX_WIDTH);
  });

  it("is safe for a degenerate window", () => {
    assert.equal(contentColumnWidth(0), 0);
  });
});
