/** Reasoning capability: the level vocabulary and what a turn sends.
 *
 * Run: node --test tests/reasoning-capability.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EFFORT_LEVEL,
  EFFORT_LABELS,
  EFFORT_LEVELS,
  isEffortLevel,
  resolveEffort,
} from "../lib/reasoning-capability.ts";

describe("effort vocabulary", () => {
  it("carries PocketPal's six levels, lowest to highest", () => {
    assert.deepEqual([...EFFORT_LEVELS], [
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("labels every level the chips render", () => {
    for (const level of EFFORT_LEVELS) {
      assert.equal(typeof EFFORT_LABELS[level], "string");
      assert.notEqual(EFFORT_LABELS[level], "");
    }
  });

  it("recognizes only canonical levels", () => {
    assert.equal(isEffortLevel("high"), true);
    assert.equal(isEffortLevel("HIGH"), false);
    assert.equal(isEffortLevel("extreme"), false);
    assert.equal(isEffortLevel(3), false);
    assert.equal(DEFAULT_EFFORT_LEVEL, "medium", "the middle rung is the default");
  });
});

describe("resolveEffort", () => {
  it("sends nothing when the user picked no level — the model's default stands", () => {
    assert.equal(resolveEffort(null), undefined);
    assert.equal(resolveEffort(undefined), undefined);
  });

  it("sends the chosen level", () => {
    assert.equal(resolveEffort("xhigh"), "xhigh");
  });
});