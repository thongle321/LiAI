/** Voice-pack planning: file split, progress weighting, disk preflight.
 * Run: node --test tests/tts-pack-plan.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  combineProgress,
  diskPreflightOk,
  planFiles,
  requiredBytes,
  sentinelMatches,
} from "../lib/tts/packPlan.ts";
import { KOKORO_VOICE_IDS, ENGINE_VERSIONS } from "../lib/tts/catalog.ts";

describe("planFiles", () => {
  it("gives Kitten one all-or-nothing phase — no per-voice files", () => {
    const { core, voice } = planFiles("kitten");
    assert.equal(voice.length, 0);
    assert.ok(core.length >= 2, "model + manifest at minimum");
  });

  it("gives Kokoro a core phase and one embedding per voice", () => {
    const { core, voice } = planFiles("kokoro");
    assert.ok(core.length >= 2);
    assert.equal(voice.length, KOKORO_VOICE_IDS.length);
  });

  it("gives Supertonic a core phase and one style file per voice", () => {
    const { core, voice } = planFiles("supertonic");
    assert.equal(core.length, 5, "4 ONNX graphs + the unicode indexer");
    assert.equal(voice.length, 10);
  });

  it("has nothing to download for the System engine", () => {
    assert.deepEqual(planFiles("system"), { core: [], voice: [] });
  });
});

describe("combineProgress", () => {
  it("weights Kitten entirely on the core phase", () => {
    assert.equal(combineProgress("kitten", 1, 0), 1);
    assert.equal(combineProgress("kitten", 0.5, 1), 0.5, "phase 2 cannot move a single-phase bar");
  });

  it("gives Kokoro's core phase 60% and Supertonic's 70%", () => {
    assert.equal(combineProgress("kokoro", 1, 0), 0.6);
    assert.equal(combineProgress("supertonic", 1, 0), 0.7);
  });

  it("reaches 1 only when both phases are done", () => {
    assert.equal(combineProgress("kokoro", 1, 1), 1);
    assert.ok(combineProgress("kokoro", 1, 0) < 1, "core alone is not 'finished'");
  });

  it("clamps out-of-range and junk fractions instead of throwing", () => {
    assert.equal(combineProgress("kokoro", -5, 0), 0);
    assert.equal(combineProgress("kokoro", 9, 0), 0.6);
    assert.equal(combineProgress("kokoro", Number.NaN, 0), 0);
  });
});

describe("diskPreflightOk", () => {
  it("demands the estimate plus 20% headroom", () => {
    assert.equal(requiredBytes("supertonic"), Math.ceil(398_352_949 * 1.2));
  });

  it("refuses a download that cannot fit, allows one that can", () => {
    assert.equal(diskPreflightOk(requiredBytes("kokoro") - 1, "kokoro"), false);
    assert.equal(diskPreflightOk(requiredBytes("kokoro"), "kokoro"), true);
  });

  it("allows the attempt when free space could not be read", () => {
    assert.equal(diskPreflightOk(null, "supertonic"), true);
  });
});

describe("sentinelMatches", () => {
  it("accepts the current version and rejects a stale one", () => {
    assert.equal(sentinelMatches("supertonic", JSON.stringify({ version: ENGINE_VERSIONS.supertonic })), true);
    assert.equal(sentinelMatches("supertonic", JSON.stringify({ version: 2 })), false);
  });

  it("rejects a corrupt or empty sentinel rather than throwing", () => {
    assert.equal(sentinelMatches("supertonic", "{bad"), false);
    assert.equal(sentinelMatches("supertonic", ""), false);
    assert.equal(sentinelMatches("supertonic", "null"), false);
  });
});