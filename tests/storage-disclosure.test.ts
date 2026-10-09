/** Continuous storage disclosure on every download surface.
 * Run: node --test tests/storage-disclosure.test.ts
 *
 * Two seams, split the way this repo splits everything. The decidable part —
 * what a card SAYS about a model against the device's free space — is a pure
 * function tested directly; the parts that need a renderer (the interval, the
 * button, the surfaces) are guarded by source assertion, since React Native
 * components cannot be imported under `node --test`.
 *
 * Comments are stripped before scanning: this file's own header QUOTES the
 * reference app's wording, which would otherwise match its own assertions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { storageDisclosure } from "../lib/models/storage-disclosure.ts";

const strip = (p: string) =>
  readFileSync(path.join(import.meta.dirname, "..", p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const MODEL = 4_200_000_000;
const FREE = 1_100_000_000;

describe("storageDisclosure", () => {
  it("states the shortfall in the reference app's wording", () => {
    const d = storageDisclosure({ modelBytes: MODEL, freeBytes: FREE });
    assert.equal(d.fits, false);
    assert.equal(d.message, "Storage low! Model 4.2 GB > 1.1 GB free");
  });

  it("says nothing when the model fits", () => {
    const d = storageDisclosure({ modelBytes: MODEL, freeBytes: 5_000_000_000 });
    assert.equal(d.fits, true);
    assert.equal(d.message, null);
  });

  it("prices a vision model's projector into the figure it states", () => {
    const d = storageDisclosure({
      modelBytes: MODEL,
      projectorBytes: 800_000_000,
      freeBytes: FREE,
    });
    assert.equal(d.message, "Storage low! Model 5 GB > 1.1 GB free");
    // The projector is the difference here: the pair does not fit.
    assert.equal(
      storageDisclosure({ modelBytes: MODEL, projectorBytes: 800_000_000, freeBytes: 5_000_000_000 }).fits,
      true,
    );
  });

  it("explains a failed reading instead of greying the button silently", () => {
    const d = storageDisclosure({ modelBytes: MODEL, freeBytes: null });
    assert.equal(d.fits, false);
    assert.match(d.message ?? "", /Couldn't read storage/);
    // Not the shortfall wording: free space is unknown, not small.
    assert.doesNotMatch(d.message ?? "", /Storage low/);
  });

  it("explains an unmeasurable model size rather than comparing nonsense", () => {
    for (const modelBytes of [0, -1, Number.NaN]) {
      const d = storageDisclosure({ modelBytes, freeBytes: FREE });
      assert.equal(d.fits, false);
      assert.match(d.message ?? "", /size/i);
      assert.doesNotMatch(d.message ?? "", /Storage low/);
    }
  });

  it("claims nothing before the first reading lands", () => {
    // The button is disabled in this window, but no reason is invented:
    // "couldn't read storage" would be a lie told for a few milliseconds.
    const d = storageDisclosure({ modelBytes: MODEL, freeBytes: null, checked: false });
    assert.equal(d.fits, false);
    assert.equal(d.message, null);
  });

  it("consumes the storage-fit decision rather than re-deriving the rule", () => {
    const src = strip("lib/models/storage-disclosure.ts");
    assert.match(src, /modelFitsOnDevice/, "the rule lives in lib/storage-fit");
    assert.doesNotMatch(src, /freeBytes\s*>|<=\s*freeBytes/, "no second copy of the rule");
  });
});

describe("the storage read is continuous", () => {
  const hook = strip("hooks/useStorageDisclosure.ts");

  it("re-reads on an interval while a card is mounted", () => {
    assert.match(hook, /setInterval\(/, "free space is polled, not read once");
    assert.match(hook, /getFreeDiskStorageAsync/, "the reading still comes from expo-file-system");
  });

  it("clears the interval on unmount", () => {
    // A leaked interval in a scrolling list keeps the screen's read alive
    // after the card is gone.
    assert.match(hook, /clearInterval\(/);
  });

  it("turns a failed read into null rather than throwing", () => {
    assert.match(hook, /\.catch\(/);
  });

  it("reports fits and the line to show, from the pure module", () => {
    assert.match(hook, /storageDisclosure/);
  });
});

describe("every download surface is covered", () => {
  it("preset cards check each quantization row", () => {
    const src = strip("components/models/AvailableModels.tsx");
    assert.match(src, /useFreeSpacePoll/, "the shared poll feeds the rows");
    assert.match(src, /storageDisclosure/, "each row gets the decision");
  });

  it("bookmark cards check themselves", () => {
    const src = strip("components/models/ModelCard.tsx");
    assert.match(src, /useStorageDisclosure/);
    assert.doesNotMatch(src, /outOfSpace/, "the one-shot prop is gone; the card owns the check");
  });

  it("Hugging Face search file rows poll while the details sheet is open", () => {
    const src = strip("components/models/HFModelSearch.tsx");
    assert.match(src, /useFreeSpacePoll/);
    assert.match(src, /storageDisclosure/);
    assert.doesNotMatch(src, /Only \$\{formatBytes/, "the old one-off free-space line is gone");
  });

  it("the onboarding picker is covered by sharing the preset card", () => {
    const src = strip("app/onboarding/model.tsx");
    assert.match(src, /<PresetModelCard/, "onboarding renders the same card as the models screen");
  });

  it("surfaces with no Download button are untouched", () => {
    for (const surface of [
      "components/models/ReadyModels.tsx",
      "components/models/ProjectorSelectorSheet.tsx",
      "components/models/DownloadErrorDialog.tsx",
    ]) {
      const src = strip(surface);
      assert.doesNotMatch(
        src,
        /useFreeSpacePoll|useStorageDisclosure|storageDisclosure|getFreeDiskStorageAsync/,
        `${surface} offers no Download button and must not grow a storage check`,
      );
    }
  });

  it("the one-shot section read is gone from the preset accordion", () => {
    const src = strip("components/models/AvailableModels.tsx");
    assert.doesNotMatch(
      src,
      /getFreeDiskStorageAsync/,
      "the read moved into the hook, which polls it",
    );
  });
});