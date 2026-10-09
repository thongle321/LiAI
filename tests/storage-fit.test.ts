/** Storage-fit tests. Run: node --test frontend/tests/storage-fit.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { modelFitsOnDevice } from "../lib/storage-fit.ts";

const MODEL = 4_200_000_000;

describe("modelFitsOnDevice", () => {
  it("allows a model that fits", () => {
    assert.equal(modelFitsOnDevice({ modelBytes: 4_200_000_000, freeBytes: 5_000_000_000 }), true);
  });

  it("blocks when free space could not be read", () => {
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, freeBytes: null }), false);
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, freeBytes: Number.NaN }), false);
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, freeBytes: Number.POSITIVE_INFINITY }), false);
  });

  it("blocks a required size that is not a positive finite number", () => {
    const free = 10_000_000_000;
    assert.equal(modelFitsOnDevice({ modelBytes: 0, freeBytes: free }), false);
    assert.equal(modelFitsOnDevice({ modelBytes: -1, freeBytes: free }), false);
    assert.equal(modelFitsOnDevice({ modelBytes: Number.NaN, freeBytes: free }), false);
    assert.equal(modelFitsOnDevice({ modelBytes: Number.POSITIVE_INFINITY, freeBytes: free }), false);
  });

  it("allows an exact fit and blocks one byte short", () => {
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, freeBytes: MODEL }), true);
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, freeBytes: MODEL - 1 }), false);
  });

  it("counts the projector toward a vision model's requirement", () => {
    const projector = 800_000_000;
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, projectorBytes: projector, freeBytes: 5_000_000_000 }), true);
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, projectorBytes: projector, freeBytes: 4_500_000_000 }), false);
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, freeBytes: 4_500_000_000 }), true);
  });

  it("allows an implausibly large free-space figure", () => {
    assert.equal(modelFitsOnDevice({ modelBytes: MODEL, freeBytes: Number.MAX_SAFE_INTEGER }), true);
  });
});
