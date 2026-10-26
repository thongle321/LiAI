/** The HF details sheet's pan rule: the file list scrolls IN PLACE, and the
 *  sheet itself only moves from the grabber — PocketParity
 *  (HFModelSearch.tsx:91-100, `enableContentPanningGesture={false}`).
 *
 *  In our TrueSheet terms that is the shared Sheet default
 *  (`scrollingExpandsSheet: false`), so the regression this guards is the
 *  details sheet overriding it back to `true` — a scroll gesture that
 *  belongs to the sheet drives its detents instead of the list. Source-
 *  level because the seam is a prop handed to native code the Jest
 *  runtime cannot drive; everything user-visible on top of it (the list,
 *  the rows) is tested in components/models/__tests__.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
  join(__dirname, "..", "components", "models", "hf-model-search.tsx"),
  "utf8",
);

describe("HF details sheet pan", () => {
  it("leaves the scroll with the content: no scrollingExpandsSheet override", () => {
    expect(SOURCE).not.toMatch(/scrollingExpandsSheet/);
  });
});
