/** Context fit classification + safe ceiling (pure, no device, no model). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  makeFitStatusFor,
  hasFittingUpgrade,
  safeCeiling,
  makeMemoryBytesFor,
} from "../lib/models/context-fit.ts";
import type { MemoryModel } from "../lib/models/memoryEstimator.ts";

const GB = 1024 * 1024 * 1024;

describe("fit classification", () => {
  it("fits at or below the ceiling (inclusive)", () => {
    const fit = makeFitStatusFor({
      memBytesFor: () => 3 * GB,
      ceiling: 3 * GB,
      totalMemory: 8 * GB,
    });
    assert.equal(fit(4096), "fits");
    assert.equal(fit(8192), "fits");
  });

  it("tight above the ceiling but at or below total memory (inclusive)", () => {
    const fit = makeFitStatusFor({
      memBytesFor: () => 5 * GB,
      ceiling: 3 * GB,
      totalMemory: 5 * GB,
    });
    assert.equal(fit(4096), "tight");
  });

  it("wont_fit above total device memory", () => {
    const fit = makeFitStatusFor({
      memBytesFor: () => 9 * GB,
      ceiling: 3 * GB,
      totalMemory: 8 * GB,
    });
    assert.equal(fit(4096), "wont_fit");
  });

  it("never returns tight when total memory is unreadable", () => {
    const fit = makeFitStatusFor({
      memBytesFor: (n) => n,
      ceiling: 1000,
      totalMemory: 0,
    });
    assert.equal(fit(1000), "fits", "ceiling still classifies");
    assert.equal(fit(1001), "wont_fit", "no middle state invented");
  });

  it("reads the requirement from the estimator at each candidate size", () => {
    const seen: number[] = [];
    const fit = makeFitStatusFor({
      memBytesFor: (nCtx) => {
        seen.push(nCtx);
        return nCtx * 2;
      },
      ceiling: 800,
      totalMemory: 10_000,
    });
    assert.equal(fit(400), "fits");
    assert.equal(fit(500), "tight");
    assert.deepEqual(seen, [400, 500]);
  });
});

describe("hasFittingUpgrade", () => {
  const LADDER = [4096, 8192, 16384, 32768];
  const ceilingFit = (allowed: number) =>
    makeFitStatusFor({
      memBytesFor: (nCtx) => nCtx,
      ceiling: allowed,
      totalMemory: 1_000_000_000,
    });

  it("true when a larger size above the current one fits", () => {
    assert.equal(hasFittingUpgrade(LADDER, 4096, ceilingFit(8192)), true);
  });

  it("false when nothing larger fits", () => {
    assert.equal(hasFittingUpgrade(LADDER, 8192, ceilingFit(8192)), false);
  });

  it("ignores sizes at or below the current one", () => {
    // Only 4096 fits, and it is the current size.
    assert.equal(hasFittingUpgrade(LADDER, 4096, ceilingFit(4096)), false);
  });

  it("ignores tight sizes — only a real fit counts", () => {
    const allTight = makeFitStatusFor({
      memBytesFor: (n) => n,
      ceiling: 1,
      totalMemory: 1_000_000,
    });
    assert.equal(allTight(8192), "tight");
    assert.equal(hasFittingUpgrade(LADDER, 4096, allTight), false);
  });
});

describe("safeCeiling", () => {
  it("takes the smaller of 60% of RAM and RAM minus 1.2GB", () => {
    // 8GB: min(4.8, 6.8) = 4.8GB.
    assert.equal(safeCeiling(8 * GB), 4.8 * GB);
    // 4GB: min(2.4, 2.8) = 2.4GB.
    assert.equal(safeCeiling(4 * GB), 2.4 * GB);
  });

  it("subtracts the 1.2GB reserve once RAM grows past 2GB", () => {
    // 16GB: min(9.6, 14.8) = 9.6GB — the 60% rule binds here.
    assert.equal(safeCeiling(16 * GB), 9.6 * GB);
    // 2.5GB: min(1.5, 1.3) = 1.3GB — the reserve binds.
    assert.equal(safeCeiling(2.5 * GB), 1.3 * GB);
  });

  it("is zero when RAM cannot be read", () => {
    assert.equal(safeCeiling(null), 0);
    assert.equal(safeCeiling(0), 0);
  });

  it("never goes negative when the reserve exceeds RAM", () => {
    // 1GB: min(0.6, -0.2) clamped to 0.
    assert.equal(safeCeiling(1 * GB), 0);
  });

  it("is raised by a successful load at a known size", () => {
    // A 5GB load succeeded on this device, so 5GB is known-safe even
    // though the fallback rule for 8GB only clears 4.8GB.
    assert.equal(safeCeiling(8 * GB, 5 * GB), 5 * GB);
    // A smaller successful load never lowers the fallback.
    assert.equal(safeCeiling(8 * GB, 1 * GB), 4.8 * GB);
  });

  it("calibration alone is enough when RAM is unreadable", () => {
    assert.equal(safeCeiling(null, 2 * GB), 2 * GB);
    assert.equal(safeCeiling(null), 0);
  });
});

describe("makeMemoryBytesFor", () => {
  const CTX = {
    cacheK: "f16",
    cacheV: "f16",
    nUbatch: 512,
    specDraftCacheK: "f16",
    specDraftCacheV: "f16",
  };
  const MODEL: MemoryModel = { size: 2 * GB };

  it("matches the estimator the model card already shows", () => {
    const bytesFor = makeMemoryBytesFor(MODEL, CTX);
    // No GGUF metadata → the estimator's flat 1.2x fallback, which is
    // context-independent, so every size agrees.
    assert.ok(Math.abs(bytesFor(4096) - 2.4 * GB) < 1);
    assert.ok(Math.abs(bytesFor(32768) - 2.4 * GB) < 1);
  });

  it("grows with context once GGUF metadata is present", () => {
    const withMeta: MemoryModel = {
      size: 2 * GB,
      gguf: {
        n_layers: 2,
        n_embd: 8,
        n_head: 4,
        n_head_kv: 2,
        n_vocab: 10,
        n_embd_head_k: 4,
        n_embd_head_v: 4,
      },
    };
    const bytesFor = makeMemoryBytesFor(withMeta, CTX);
    const small = bytesFor(100);
    const large = bytesFor(1000);
    assert.ok(large > small, "a bigger context costs more");
    // KV per token = layers × head_kv × (k + v) × 2 bytes = 2×2×8×2 = 64.
    assert.ok(Math.abs(large - small - 900 * 64 * 1.1) < 1);
  });

  it("feeds the classifier directly", () => {
    const fit = makeFitStatusFor({
      memBytesFor: makeMemoryBytesFor(MODEL, CTX),
      ceiling: 2.4 * GB,
      totalMemory: 8 * GB,
    });
    assert.equal(fit(4096), "fits");
  });
});
