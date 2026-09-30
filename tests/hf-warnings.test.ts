import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hfFileWarnings } from "../lib/models/hf-warnings.ts";

/** Every case pins the chip set AND its order, because the download
 *  snackbar numbers them and a reordering would renumber the UI. */
const base = {
  fileName: "model-Q4_K_M.gguf",
  sizeBytes: 4_000_000_000,
  isVision: false,
  hasProjector: false,
  freeBytes: 10_000_000_000,
  learnedCeilingBytes: 6_000_000_000,
  requiredBytes: 4_000_000_000,
};

describe("hfFileWarnings", () => {
  it("says nothing for a file that fits comfortably", () => {
    assert.deepEqual(hfFileWarnings(base), []);
  });

  it("flags a file larger than the free space", () => {
    const warnings = hfFileWarnings({ ...base, freeBytes: 1_000_000_000 });
    assert.deepEqual(
      warnings.map((w) => w.code),
      ["not-enough-space"],
    );
    assert.equal(warnings[0].label, "Not enough space");
  });

  it("flags a file larger than the learned ceiling, but not a cold ceiling", () => {
    // 0 means nothing has downloaded successfully yet, so there is no
    // learned expectation to contradict: warning on it would fire on
    // every first download on a fresh device.
    assert.deepEqual(hfFileWarnings({ ...base, learnedCeilingBytes: 0 }), []);
    assert.deepEqual(
      hfFileWarnings({ ...base, learnedCeilingBytes: 3_000_000_000 }).map(
        (w) => w.code,
      ),
      ["short-memory"],
    );
  });

  it("flags a vision model with no projector", () => {
    assert.deepEqual(
      hfFileWarnings({ ...base, isVision: true }).map((w) => w.code),
      ["multimodal-without-projector"],
    );
    // Paired (future mmproj work) means nothing to warn about.
    assert.deepEqual(
      hfFileWarnings({ ...base, isVision: true, hasProjector: true }),
      [],
    );
  });

  it("flags the legacy Q4_0 quants only", () => {
    for (const legacy of ["m-Q4_0_4_8.gguf", "m-Q4_0_4_4.gguf", "m-Q4_0_8_8.gguf"]) {
      assert.deepEqual(
        hfFileWarnings({ ...base, fileName: legacy }).map((w) => w.code),
        ["legacy-quantization"],
        legacy,
      );
    }
    assert.deepEqual(hfFileWarnings({ ...base, fileName: "m-Q4_K_M.gguf" }), []);
  });

  it("reports every applicable warning in the agreed order", () => {
    const warnings = hfFileWarnings({
      ...base,
      fileName: "m-Q4_0_4_8.gguf",
      isVision: true,
      freeBytes: 1_000_000_000,
      learnedCeilingBytes: 3_000_000_000,
    });
    assert.deepEqual(
      warnings.map((w) => w.code),
      [
        "not-enough-space",
        "short-memory",
        "multimodal-without-projector",
        "legacy-quantization",
      ],
    );
  });

  it("skips the space check when free space is unknown", () => {
    // Reading free disk can fail (permissions, some OEM volumes). A
    // missing number is not a reason to block the button.
    assert.deepEqual(hfFileWarnings({ ...base, freeBytes: null }), []);
  });
});
