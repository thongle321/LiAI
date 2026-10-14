import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateModelMemory,
  getKVCacheTypeBytes,
} from "../lib/models/memoryEstimator.ts";

// Port of PocketPal's utils/memoryEstimator.ts formula
// (weights + KV cache + compute buffer, × overhead). Every expected
// value below is hand-computed from that formula, not from the code.

const META = {
  n_layers: 2,
  n_embd: 8,
  n_head: 4,
  n_head_kv: 2,
  n_vocab: 10,
  n_embd_head_k: 4,
  n_embd_head_v: 4,
};

const CTX = {
  nCtx: 100,
  cacheK: "f16",
  cacheV: "f16",
  nUbatch: 10,
};

test("KV cache type bytes follow llama.cpp sizes", () => {
  assert.equal(getKVCacheTypeBytes("f16"), 2.0);
  assert.equal(getKVCacheTypeBytes("q4_0"), 0.5625);
  assert.equal(getKVCacheTypeBytes("Q8_0"), 1.0625);
  assert.equal(getKVCacheTypeBytes("mystery"), 2.0);
});

// Byte totals tolerate float dust from the ×1.1/×1.2 overhead: the
// implementation ports PocketPal's formula verbatim (floats), so
// expectations hold to the byte, not the bit.
const nearBytes = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1,
    `expected ${expected} bytes, got ${actual}`,
  );

test("weights + KV cache + compute buffer, × 1.1 overhead", () => {
  // KV: key 2×100×4×2×2 = 3200, value the same → 6400.
  // Compute: (10 + 8) × 10 × 4 = 720.
  // Base 1_000_000 + 6400 + 720 = 1_007_120 → × 1.1 = 1_107_832.
  nearBytes(
    estimateModelMemory({ size: 1_000_000, gguf: META }, undefined, undefined, CTX),
    1_107_832,
  );
});

test("projection bytes ride along at the same overhead", () => {
  // 1_107_832 + 500_000 × 1.1 = 1_657_832.
  nearBytes(
    estimateModelMemory({ size: 1_000_000, gguf: META }, 500_000, undefined, CTX),
    1_657_832,
  );
});

test("sliding-window models cap the effective context", () => {
  // Effective ctx min(100, 50) = 50: KV 1600 + 1600 = 3200.
  // Base 1_000_000 + 3200 + 720 = 1_003_920 → × 1.1 = 1_104_312.
  nearBytes(
    estimateModelMemory(
      { size: 1_000_000, gguf: { ...META, sliding_window: 50 } },
      undefined,
      undefined,
      CTX,
    ),
    1_104_312,
  );
});

test("missing or corrupt metadata falls back to size × 1.2", () => {
  nearBytes(
    estimateModelMemory({ size: 1_000_000, gguf: undefined }, undefined, undefined, CTX),
    1_200_000,
  );
  nearBytes(
    estimateModelMemory(
      { size: 1_000_000, gguf: { ...META, n_layers: 0 } },
      undefined,
      undefined,
      CTX,
    ),
    1_200_000,
  );
  // No context settings either: weights-only estimate still holds.
  nearBytes(
    estimateModelMemory({ size: 1_000_000, gguf: META }),
    1_200_000,
  );
});
