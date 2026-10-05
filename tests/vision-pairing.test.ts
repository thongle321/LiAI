import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { findProjectorFile, pairDownloadStep } from "../lib/models/vision-pairing.ts";
import { upgradeModelSpec } from "../lib/model-upgrade.ts";

// vision-series 01: the models card promises a vision pair ("LLM + projector")
// but nothing ever fetched the projector. These tests pin the pairing rule
// (shared with the size card so they cannot drift), the download sequencing,
// and the persisted projector record's hydration.

describe("findProjectorFile", () => {
  const siblings = [
    { name: "Qwen3-0.6B-Q4_K_M.gguf", size: 400, downloadUrl: "u1" },
    { name: "mmproj-Qwen3-0.6B-f16.gguf", size: 90, downloadUrl: "u2" },
    { name: "mmproj-Other-2B-f16.gguf", size: 500, downloadUrl: "u3" },
  ];

  it("pairs the family's mmproj (same rule the size card uses)", () => {
    assert.equal(findProjectorFile(siblings[0], siblings)?.name, "mmproj-Qwen3-0.6B-f16.gguf");
  });

  it("falls back to the SMALLEST mmproj when no family matches", () => {
    assert.equal(
      findProjectorFile({ name: "other.gguf", size: 10, downloadUrl: "u4" }, siblings)?.name,
      "mmproj-Qwen3-0.6B-f16.gguf",
    );
  });

  it("returns undefined when the repo carries no mmproj — no pair to promise", () => {
    assert.equal(findProjectorFile({ name: "plain.gguf", size: 10, downloadUrl: "u5" }, [siblings[0]]), undefined);
    assert.equal(findProjectorFile({ name: "plain.gguf", size: 10 }, []), undefined);
  });
});

describe("pairDownloadStep", () => {
  it("downloads the main file first", () => {
    assert.equal(pairDownloadStep(true, false, false), "main");
    assert.equal(pairDownloadStep(false, false, false), "main");
  });

  it("moves to the projector once the main file is complete", () => {
    assert.equal(pairDownloadStep(true, true, false), "projector");
  });

  it("is complete when everything needed is on disk", () => {
    assert.equal(pairDownloadStep(false, true, false), "complete");
    assert.equal(pairDownloadStep(true, true, true), "complete");
  });
});

describe("ModelSpec.projector hydration", () => {
  it("keeps a valid projector record (name, size, downloadUrl)", () => {
    const out = upgradeModelSpec({
      id: "m1",
      name: "M",
      projector: { name: "mmproj-x-f16.gguf", size: 90, downloadUrl: "u" },
    });
    assert.deepEqual(out?.projector, {
      name: "mmproj-x-f16.gguf",
      size: 90,
      downloadUrl: "u",
    });
  });

  it("drops malformed projector records — a bad pair is no pair", () => {
    for (const projector of [
      "x",
      42,
      null,
      { name: 1, size: 90, downloadUrl: "u" },
      { name: "x", downloadUrl: "u" },
      { name: "x", size: "90", downloadUrl: "u" },
    ]) {
      assert.equal(upgradeModelSpec({ id: "m1", name: "M", projector })?.projector, undefined);
    }
  });
});

// store/models/downloads.ts can't load under node (expo-file-system), so the
// wiring is pinned as source — the established pattern for this store
// (tests/download-error.test.ts).
describe("downloads wiring", () => {
  const src = readFileSync("store/models/downloads.ts", "utf8");

  it("pairs at startDownload and records the projector on the spec", () => {
    assert.match(src, /findProjectorFile\(/, "pairs via the shared helper");
    assert.match(src, /spec\.projector/, "projector recorded on the spec");
  });

  it("sequences main → projector via pairDownloadStep", () => {
    assert.match(src, /pairDownloadStep\(/, "sequencing is the shared helper");
  });

  it("hands off to the projector leg when the main file completes", () => {
    assert.match(
      src,
      /downloadJob\.fileName === specNow\?\.files\[0\]\?\.name/,
      "main-leg completion starts the projector leg instead of finishing",
    );
  });
});
