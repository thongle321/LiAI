/** Download failure reason guard (issue 01, gap C1).
 *
 * The store already writes a reason into `spec.error` ("Not enough storage
 * space to download the model", the transfer's own message) and the UI threw
 * it away — DownloadButton rendered a bare "Retry". These pins keep the
 * reason wired end to end: the button reads the field, shows it, carries it
 * in the accessibility label, and every failed-state caller passes it down.
 *
 * Run: node --test tests/download-error.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("download failure reason", () => {
  it("DownloadButton reads and renders the stored reason", () => {
    const source = read("components/models/ModelBits.tsx");
    // The prop exists on DownloadButton...
    assert.match(
      source,
      /error\?: string/,
      "DownloadButton must accept the spec's error field",
    );
    // ...and the reason is rendered, not just "Retry".
    assert.match(
      source,
      /\{reason\}/,
      "the stored reason must be visible when a download fails",
    );
    // Absent/empty reason keeps today's wording — never an empty label.
    assert.match(
      source,
      /\? "Retry"/,
      "a failed download without a reason must still say Retry",
    );
    // The reason derives from the passed-in error — not from anything else.
    assert.match(
      source,
      /const reason = isFailed && error/,
      "the rendered reason must come from the spec's error field",
    );
  });

  it("carries the reason in the accessibility label", () => {
    const source = read("components/models/ModelBits.tsx");
    assert.match(
      source,
      /`Retry download\$\{reason/,
      "the button's accessibility label must include the reason",
    );
  });

  it("every failed-state caller passes spec.error through", () => {
    assert.match(
      read("components/models/ModelCard.tsx"),
      /error=\{item\.error\}/,
      "bookmark cards must pass the spec's error",
    );
    assert.match(
      read("components/models/HFModelSearch.tsx"),
      /error=\{spec\?\.error\}/,
      "HF search rows must pass the spec's error",
    );
    assert.match(
      read("components/models/AvailableModels.tsx"),
      /error=\{st\.error\}/,
      "preset file rows must pass the file state's error",
    );
  });
});
