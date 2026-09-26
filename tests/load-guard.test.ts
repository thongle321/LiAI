/** Load-guard tests. Run: node --test frontend/tests/load-guard.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { exceedsLearnedCeiling } from "../lib/load-guard.ts";

describe("exceedsLearnedCeiling", () => {
  it("never warns without history", () => {
    assert.equal(exceedsLearnedCeiling(10_000_000_000, 0), false);
  });

  it("warns beyond 1.5x the largest success", () => {
    assert.equal(exceedsLearnedCeiling(100, 100), false);
    assert.equal(exceedsLearnedCeiling(150, 100), false);
    assert.equal(exceedsLearnedCeiling(151, 100), true);
  });
});
