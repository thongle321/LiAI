/** The download progress bar: dimensions and one shared idiom.
 * Run: node --test tests/progress-bar.test.ts
 *
 * The bar is a react-native component, so it cannot be imported under
 * `node --test`. Its wiring is pinned as SOURCE, the same seam
 * message-list.test.ts and turn-footer.test.ts use: what matters is that the
 * bar has the agreed dimensions and that every download surface goes through
 * the one component — not which JSX spells it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Comments are stripped before scanning: this file's own header QUOTES the
// strings it asserts, and ModelBits.tsx's comments describe the old radius.
const strip = (p: string) =>
  readFileSync(path.join(import.meta.dirname, "..", p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const BITS = strip("components/models/ModelBits.tsx");
// The bar's own component only — the rest of the file has `min-h-12`
// buttons, which would trip a naive `h-1` scan.
const track = BITS.slice(
  BITS.indexOf("export function ProgressTrack"),
  BITS.indexOf("export function DownloadProgressBar"),
);

describe("progress bar proportions", () => {
  it("is eight pixels tall with a five-pixel radius", () => {
    // The reference app's proportions (spec: "eight pixels tall with a
    // five-pixel radius"). Ours was h-1 (4px) rounded-full.
    assert.match(track, /className="h-2[^"]*"/, "the track must be h-2 (8px), not h-1");
    assert.match(track, /rounded-\[5px\]/, "the track must carry a five-pixel radius");
    assert.doesNotMatch(track, /h-1/, "the old four-pixel bar is gone");
  });

  it("is drawn with this app's colour tokens", () => {
    assert.match(track, /bg-surface-2/);
    assert.match(track, /bg-primary/);
    assert.doesNotMatch(track, /#[0-9a-fA-F]{3,8}/, "no hardcoded colour");
  });
});

describe("one progress idiom across every download surface", () => {
  it("routes every surface through the shared bar", () => {
    for (const surface of [
      "components/models/AvailableModels.tsx",
      "components/models/HFFileRow.tsx",
      "components/models/ModelCard.tsx",
    ]) {
      assert.match(strip(surface), /DownloadProgressBar/, `${surface} must use the shared bar`);
    }
  });

  it("does not adopt the reference's gradient wash on file cards", () => {
    // The WHOLE flow, not just the row. This used to read one file that
    // happened to contain all of it, so repointing it at the row alone
    // would have quietly stopped guarding the other three.
    for (const file of [
      "components/models/HFModelSearch.tsx",
      "components/models/HFSearchView.tsx",
      "components/models/HFDetailsView.tsx",
      "components/models/HFFileRow.tsx",
    ]) {
      assert.doesNotMatch(
        strip(file),
        /linear-gradient|expo-linear-gradient/,
        `${file} must not adopt the gradient wash — it is not this app's idiom`,
      );
    }
  });
});
