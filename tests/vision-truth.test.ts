import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { multimodalAvailable, MULTIMODAL_WARNING } from "../store/chat/send.ts";

// vision-series 01: the vision screen must not answer blind in silence —
// it shows the same can't-see message the send path uses, read through the
// SAME seam, so ticket 02 (real capability) silences the notice for free.

describe("the capability seam is shared", () => {
  it("the send path exports the gate the vision screen reads", () => {
    assert.equal(typeof multimodalAvailable, "function");
    assert.equal(typeof MULTIMODAL_WARNING, "string");
    assert.match(MULTIMODAL_WARNING, /can't see images/);
  });

  it("the vision hook surfaces the warning through that seam", () => {
    const src = readFileSync("hooks/useVisionTurn.ts", "utf8");
    assert.match(src, /multimodalAvailable/, "reads the seam, not a copy");
    assert.match(src, /MULTIMODAL_WARNING/, "uses the send path's wording");
    assert.match(
      src,
      /if \(!\(await multimodalAvailable\(\)\)\)[\s\S]{0,120}?setIssue\(MULTIMODAL_WARNING\)/,
      "warning set when images were stripped",
    );
  });
});

describe("the vision screen's docs tell the truth", () => {
  const header = readFileSync("app/(drawer)/(tabs)/vision.tsx", "utf8").slice(0, 2500);

  it("describes snapshot-on-question, not a frame stream or socket", () => {
    assert.match(header, /snapshot/i, "the real capture behavior is named");
    assert.doesNotMatch(header, /500ms/, "no stale interval claim");
    assert.doesNotMatch(header, /vision socket/i, "there is no vision socket");
    assert.doesNotMatch(header, /worklet/i, "there is no frame-processor worklet");
  });
});

describe("vision answers only when asked (recorded product decision)", () => {
  for (const file of ["hooks/useVisionTurn.ts", "app/(drawer)/(tabs)/vision.tsx"]) {
    it(`${file} never auto-captures on a timer`, () => {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /setInterval/, "no capture loop — PocketPal's auto-send loop is rejected");
      assert.doesNotMatch(src, /startImageCompletion/, "no auto-inference path");
    });
  }
});
