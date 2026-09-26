/** Device-tier matching + JSON shape guard (pure, node-safe fixtures). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  matchTier,
  parseTiers,
  type DeviceTier,
} from "../lib/models/device-tiers.ts";

// RAM is binary: test inputs are MiB, matching the matcher's units.
const MIB = 1024 * 1024;

const FIXTURES: DeviceTier[] = [
  { id: "light", label: "Light", minRamMb: 0, blurb: "", presetIds: ["a"] },
  {
    id: "balanced",
    label: "Balanced",
    minRamMb: 4096,
    blurb: "",
    presetIds: ["b"],
  },
  {
    id: "capable",
    label: "Capable",
    minRamMb: 8192,
    blurb: "",
    presetIds: ["c"],
  },
];

describe("matchTier", () => {
  it("falls back to the lightest tier when memory is unknown", () => {
    assert.equal(matchTier(null, FIXTURES).id, "light");
  });

  it("matches the light tier on a 2GB phone", () => {
    assert.equal(matchTier(2 * 1024 * MIB, FIXTURES).id, "light");
  });

  it("matches the balanced tier on the 4GB boundary", () => {
    assert.equal(matchTier(4 * 1024 * MIB, FIXTURES).id, "balanced");
  });

  it("matches the capable tier on a 12GB phone", () => {
    assert.equal(matchTier(12 * 1024 * MIB, FIXTURES).id, "capable");
  });
});

describe("parseTiers", () => {
  it("rejects empty and malformed payloads", () => {
    assert.throws(() => parseTiers([]), /missing or empty/);
    assert.throws(() => parseTiers([{ id: "x" }]), /malformed/);
  });
});

describe("device-tiers.json", () => {
  it("ships three tiers sorted by min RAM covering every preset", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "assets", "device-tiers.json"), "utf8");
    const all = parseTiers(JSON.parse(raw));
    assert.deepEqual(
      all.map((t) => t.id),
      ["light", "balanced", "capable"],
    );
    const covered = [...new Set(all.flatMap((t) => t.presetIds))].sort();
    assert.deepEqual(covered, [
      "bonsai-1.7b",
      "bonsai-4b",
      "bonsai-8b",
      "gemma-3-1b",
      "gemma-3-4b",
      "gemma-4-e2b",
      "gemma-4-e4b",
      "lfm2-2.6b",
      "lfm2-vl-1.6b",
      "lfm2.5-1.2b",
      "lfm2.5-350m",
      "lfm2.5-8b-a1b",
      "ministral-3-3b",
      "phi-4-mini",
      "qwen3-0.6b",
      "qwen3-1.7b",
      "qwen3.5-4b",
      "smollm3-3b",
    ]);
  });
});
