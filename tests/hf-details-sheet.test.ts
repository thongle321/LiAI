/** The HF details sheet's copy (PocketParity: pocketpal-ai
 * DetailsView.tsx:138-152, ModelFileCard.tsx:323-338).
 *
 * Run: node --test tests/hf-details-sheet.test.ts
 *
 * WHY A SOURCE SCAN: the sheet is a component that mounts native Sheet and
 * Lucide icons, so the runner cannot render it — the repo's standing
 * pattern for copy that must not drift.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(
  path.join(import.meta.dirname, "..", "components", "models", "HFModelSearch.tsx"),
  "utf8",
);

describe("HF details sheet", () => {
  it("names the file list the way the reference does", () => {
    assert.match(
      SOURCE,
      /Available GGUF Files/,
      'en.json models.details.title; "Files" alone names neither the kind nor the list',
    );
  });

  it("marks a gated repo's file as needing a token", () => {
    assert.match(
      SOURCE,
      /result\.gated[\s\S]{0,400}Requires Token/,
      "without the chip a gated file 401s halfway through the download",
    );
  });

  it("keeps the two stacked sheets: search underneath, details on top", () => {
    assert.match(SOURCE, /testID="hf-search-sheet"/);
    assert.match(SOURCE, /testID="hf-details-sheet"/);
  });
});
