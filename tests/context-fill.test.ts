/** Context-window fill maths (G1 banner meter).
 * Run: node --test tests/context-fill.test.ts
 *
 * Pure on purpose: the function lives in lib/ rather than in the banner
 * component so this suite can load it without react-native. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fillPercent } from "../lib/chat/context-fill.ts";

describe("fillPercent", () => {
  it("reports the share of the window in use", () => {
    assert.equal(fillPercent(2048, 4096), 50);
    assert.equal(fillPercent(4096, 4096), 100);
  });

  it("rounds to a whole percent", () => {
    assert.equal(fillPercent(1000, 4096), 24);
  });

  it("clamps above 100 rather than rendering a broken meter", () => {
    // A remote endpoint, or a turn counted against a stale window, can
    // report more prompt tokens than the configured size. A 137% meter is
    // a bug report waiting to happen.
    assert.equal(fillPercent(8192, 4096), 100);
    assert.equal(fillPercent(100000, 4096), 100);
  });

  it("clamps below zero rather than rendering a negative meter", () => {
    assert.equal(fillPercent(-5, 4096), 0);
  });

  it("reads 0 when the turn reported no prompt tokens yet", () => {
    assert.equal(fillPercent(undefined, 4096), 0);
    assert.equal(fillPercent(0, 4096), 0);
  });

  it("reads 0 when the window is unset or nonsense, rather than dividing", () => {
    assert.equal(fillPercent(1000, 0), 0);
    assert.equal(fillPercent(1000, -1), 0);
  });

  it("handles a very large window without overflowing into nonsense", () => {
    assert.equal(fillPercent(65536, 131072), 50);
  });
});