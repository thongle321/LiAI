/** Sampler defaults, clamping, and global-vs-per-model precedence.
 *
 * Pure module, no native import, so this runs under node --test like the
 * rest of lib/inference. The defaults are PocketPal's CompletionSettings
 * values, chosen deliberately over llama.rn's own (see ADR-0013).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SAMPLER,
  parseSampler,
  resolveSampler,
  toLlamaSampler,
  type SamplerParams,
} from "../lib/inference/sampler.ts";

describe("sampler defaults", () => {
  it("are PocketPal's CompletionSettings values", () => {
    assert.deepEqual(DEFAULT_SAMPLER, {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      minP: 0.05,
      typicalP: 1,
      xtcThreshold: 0.1,
      xtcProbability: 0,
      penaltyLastN: 64,
      penaltyRepeat: 1,
      penaltyFrequency: 0,
      penaltyPresence: 0,
      mirostat: 0,
      mirostatTau: 5,
      mirostatEta: 0.1,
      seed: -1,
      nPredict: -1,
    });
  });

  it("survive a round trip through storage unchanged", () => {
    assert.deepEqual(
      parseSampler(JSON.parse(JSON.stringify(DEFAULT_SAMPLER))),
      DEFAULT_SAMPLER,
    );
  });
});

describe("sampler parsing", () => {
  it("falls back to defaults for junk, null, and arrays", () => {
    for (const junk of [null, undefined, 42, "nope", [], true]) {
      assert.deepEqual(parseSampler(junk), DEFAULT_SAMPLER);
    }
  });

  it("keeps good values and replaces only the ones that make no sense", () => {
    const parsed = parseSampler({
      temperature: 0.42,
      topP: 5,
      mirostat: 9,
      seed: "abc",
    });
    assert.equal(parsed.temperature, 0.42);
    assert.equal(parsed.topP, 1, "a probability above 1 clamps to 1");
    assert.equal(parsed.mirostat, 0, "an unknown mode is off, not garbage");
    assert.equal(parsed.seed, -1, "a non-numeric seed is random");
  });

  it("clamps negatives and absurd magnitudes to their range", () => {
    const parsed = parseSampler({
      temperature: -3,
      penaltyRepeat: 99,
      nPredict: 100000,
      mirostatTau: -1,
    });
    assert.equal(parsed.temperature, 0);
    assert.equal(parsed.penaltyRepeat, 2);
    assert.equal(parsed.nPredict, 8192);
    assert.equal(parsed.mirostatTau, 0);
  });

  it("treats seed -1 and nPredict -1 as the sentinels they are", () => {
    // -1 means "random seed" and "unlimited length" in llama.cpp; clamping
    // them to 0 would silently freeze generation.
    const parsed = parseSampler({ seed: -1, nPredict: -1 });
    assert.equal(parsed.seed, -1);
    assert.equal(parsed.nPredict, -1);
  });

  it("ignores an inherited object so a prototype leak cannot set values", () => {
    const parsed = parseSampler(
      Object.create({ temperature: 0.01 }) as Record<string, unknown>,
    );
    assert.equal(parsed.temperature, DEFAULT_SAMPLER.temperature);
  });
});

describe("sampler precedence", () => {
  const global: SamplerParams = { ...DEFAULT_SAMPLER, temperature: 0.7, topP: 0.95 };

  it("uses the global value when a model overrides nothing", () => {
    assert.equal(resolveSampler(global, null).temperature, 0.7);
    assert.equal(resolveSampler(global, {}).temperature, 0.7);
  });

  it("lets a per-model value win field by field, not wholesale", () => {
    const resolved = resolveSampler(global, { temperature: 0.15 });
    assert.equal(resolved.temperature, 0.15, "the override applies");
    assert.equal(resolved.topP, 0.95, "everything else still comes from global");
  });

  it("ignores an override field that is not a finite number", () => {
    const resolved = resolveSampler(global, {
      temperature: "cold",
    } as unknown as Partial<SamplerParams>);
    assert.equal(resolved.temperature, 0.7);
  });

  it("clamps a per-model override into range instead of trusting it", () => {
    const resolved = resolveSampler(global, { topP: 4 });
    assert.equal(resolved.topP, 1);
  });
});

describe("pocketpal ranges", () => {
  // The bounds are PocketPal's, not llama.cpp's widest: a curated range is a
  // better control than one spanning values no one should pick.
  it("clamps top K to 1-128", () => {
    assert.equal(parseSampler({ topK: 500 }).topK, 128);
    assert.equal(parseSampler({ topK: 0 }).topK, 1);
    assert.equal(parseSampler({ topK: 40 }).topK, 40);
  });

  it("allows typical P above 1, up to 2", () => {
    assert.equal(parseSampler({ typicalP: 1.5 }).typicalP, 1.5);
    assert.equal(parseSampler({ typicalP: 3 }).typicalP, 2);
  });

  it("clamps the penalty window to 0-256", () => {
    assert.equal(parseSampler({ penaltyLastN: 1000 }).penaltyLastN, 256);
    assert.equal(parseSampler({ penaltyLastN: 64 }).penaltyLastN, 64);
  });

  it("keeps the default seed and length sentinels", () => {
    const d = DEFAULT_SAMPLER;
    assert.equal(d.seed, -1);
    assert.equal(d.nPredict, -1);
  });
});

describe("llama.rn parameter mapping", () => {
  it("uses llama.rn's own snake_case names", () => {
    assert.deepEqual(toLlamaSampler(DEFAULT_SAMPLER), {
      temperature: 0.7,
      top_k: 40,
      top_p: 0.95,
      min_p: 0.05,
      typical_p: 1,
      xtc_threshold: 0.1,
      xtc_probability: 0,
      penalty_last_n: 64,
      penalty_repeat: 1,
      // llama.rn calls these freq/present, not frequency/presence.
      penalty_freq: 0,
      penalty_present: 0,
      mirostat: 0,
      mirostat_tau: 5,
      mirostat_eta: 0.1,
      seed: -1,
      n_predict: -1,
    });
  });

  it("carries both -1 sentinels through untouched", () => {
    const mapped = toLlamaSampler(DEFAULT_SAMPLER);
    assert.equal(mapped.seed, -1);
    assert.equal(mapped.n_predict, -1);
  });
});
