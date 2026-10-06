import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findProjectorFile,
  mmprojSiblings,
  modelsUsingProjector,
  pairDownloadStep,
  projectorStatus,
  visionActive,
} from "../lib/models/vision-pairing.ts";
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

// The vision switch + selector (Q1-Q3): the rules the card's UI reads.
// Pinned here because a wrong answer is a card that lies — "Ready" over a
// missing projector, or a toggle that no-ops.
describe("mmprojSiblings", () => {
  const files = [
    { name: "model-Q4_K_M.gguf" },
    { name: "mmproj-model-f16.gguf" },
    { name: "MMPROJ-Other-f16.gguf" },
  ];

  it("lists every projector, case-insensitively", () => {
    assert.deepEqual(
      mmprojSiblings(files).map((f) => f.name),
      ["mmproj-model-f16.gguf", "MMPROJ-Other-f16.gguf"],
    );
  });

  it("is empty for a text-only repo", () => {
    assert.deepEqual(mmprojSiblings([{ name: "model.gguf" }]), []);
  });
});

describe("projectorStatus / visionActive", () => {
  it("needs no projector when none is recorded", () => {
    assert.equal(projectorStatus({ hasProjector: false, projectorBytes: 0 }), "not_needed");
  });

  it("is missing when recorded but nothing is on disk", () => {
    assert.equal(projectorStatus({ hasProjector: true, projectorBytes: 0 }), "missing");
  });

  it("is downloaded once bytes landed", () => {
    assert.equal(projectorStatus({ hasProjector: true, projectorBytes: 90 }), "downloaded");
  });

  it("vision is off if the switch is off, whatever the projector says", () => {
    assert.equal(visionActive({ visionEnabled: false, status: "downloaded" }), false);
    assert.equal(visionActive({ visionEnabled: true, status: "downloaded" }), true);
    assert.equal(visionActive({ visionEnabled: true, status: "missing" }), false);
    assert.equal(visionActive({ visionEnabled: true, status: "not_needed" }), false);
  });
});

describe("modelsUsingProjector", () => {
  it("names the models that would lose vision if it is detached", () => {
    const models = [
      { name: "A", projector: { name: "mmproj-x.gguf" } },
      { name: "B", projector: { name: "mmproj-y.gguf" } },
      { name: "C", projector: undefined },
    ];
    assert.deepEqual(
      modelsUsingProjector(models, "mmproj-x.gguf").map((m) => m.name),
      ["A"],
    );
  });
});

describe("ModelSpec.projector hydration", () => {
  it("keeps selector candidates and the vision switch", () => {
    const out = upgradeModelSpec({
      id: "m1",
      name: "M",
      supportsVision: true,
      visionEnabled: false,
      projectorCandidates: [
        { name: "mmproj-a.gguf", size: 90, downloadUrl: "u" },
        { name: "bad", size: "90", downloadUrl: "u" },
      ],
    });
    assert.equal(out?.supportsVision, true);
    assert.equal(out?.visionEnabled, false);
    assert.deepEqual(out?.projectorCandidates, [
      { name: "mmproj-a.gguf", size: 90, downloadUrl: "u" },
    ]);
  });

  it("infers vision-capability for rows saved before the switch existed", () => {
    assert.equal(
      upgradeModelSpec({
        id: "m1",
        name: "M",
        projector: { name: "mmproj-x.gguf", size: 90, downloadUrl: "u" },
      })?.supportsVision,
      true,
    );
    assert.equal(
      upgradeModelSpec({ id: "m1", name: "M", type: "vision" })?.supportsVision,
      true,
    );
    assert.equal(upgradeModelSpec({ id: "m1", name: "M" })?.supportsVision, false);
  });
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
