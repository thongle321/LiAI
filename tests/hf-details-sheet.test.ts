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
/** The flow is split to mirror the reference's four files, so each
 *  assertion below reads the file that now owns that piece of copy. */
const DETAILS = readFileSync(
  path.join(import.meta.dirname, "..", "components", "models", "HFDetailsView.tsx"),
  "utf8",
);
const ROW = readFileSync(
  path.join(import.meta.dirname, "..", "components", "models", "HFFileRow.tsx"),
  "utf8",
);

const BITS = readFileSync(
  path.join(import.meta.dirname, "..", "components", "models", "ModelBits.tsx"),
  "utf8",
);

describe("HF details sheet", () => {
  it("names the file list the way the reference does", () => {
    assert.match(
      DETAILS,
      /Available GGUF Files/,
      'en.json models.details.title; "Files" alone names neither the kind nor the list',
    );
  });

  it("marks a gated repo's file as needing a token", () => {
    assert.match(
      ROW,
      /result\.gated[\s\S]{0,400}Requires Token/,
      "without the chip a gated file 401s halfway through the download",
    );
  });

  it("clamps a long GGUF name instead of wrapping the row", () => {
    assert.match(ROW, /ellipsizeMode="middle"/);
    assert.match(ROW, /numberOfLines=\{1\}/);
  });

  it("collapses every warning into one chip that opens the detail list", () => {
    assert.match(
      ROW,
      /warnings\.length > 1/,
      "four warning chips can fire for one file, and the row has one line",
    );
    assert.match(
      ROW,
      /onWarn/,
      "the chip opens the snackbar; the machinery already existed unwired",
    );
    assert.doesNotMatch(
      ROW,
      /warnings\.map\(\(w\) => \(\s*<WarningChip/,
      "one chip, not one per warning",
    );
  });

  it("states whether vision is enabled rather than only offering it", () => {
    assert.match(ROW, /Vision enabled/, "the downloaded state word");
    assert.match(
      ROW,
      /Includes vision capability/,
      "the reference's available label (ModelFileCard.tsx:308-330)",
    );
  });

  it("makes a downloaded file's one action the destructive one", () => {
    assert.match(
      ROW,
      /isProgressVisible\(status\) \? null : status === "completed" \?/,
      "one control per state: the download button gives way to the delete glyph (ModelFileCard.tsx:196-224)",
    );
    assert.match(ROW, /<Trash2/, "the glyph the card already uses for delete");
    assert.match(
      ROW,
      /confirmDeleteModel/,
      "the shared destructive confirm, not a second wording",
    );
    assert.match(ROW, /removeModel/);
  });

  it("leaves the shared DownloadButton's inert completed branch alone", () => {
    assert.match(
      BITS,
      /if \(isCompleted\)/,
      "the models-screen card still shows a state, not an action",
    );
    assert.doesNotMatch(
      BITS,
      /onDelete/,
      "the shared button grew no delete mode; the row draws its own control",
    );
  });

  it("keeps the two stacked sheets: search underneath, details on top", () => {
    assert.match(SOURCE, /testID="hf-search-sheet"/);
    assert.match(SOURCE, /testID="hf-details-sheet"/);
  });
});
