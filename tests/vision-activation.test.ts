import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { projectorPathFromSpecs } from "../lib/inference/mmproj.ts";

// vision-series 02: the engine load attaches the projector and the image
// gate stops being hardcoded false. "Can see" = the ACTIVE local model's
// spec is completed (ticket 01 guarantees the pair landed) AND records a
// projector — a declaration alone never flips it.

const specs = [
  {
    id: "v1",
    downloadStatus: "completed",
    files: [{ name: "v.gguf", size: 400, downloadUrl: "u" }],
    projector: { name: "mmproj-v-f16.gguf", size: 90, downloadUrl: "u2" },
  },
  {
    id: "t1",
    downloadStatus: "completed",
    files: [{ name: "t.gguf", size: 300, downloadUrl: "u" }],
  },
  {
    id: "half",
    downloadStatus: "downloading",
    files: [{ name: "h.gguf", size: 1, downloadUrl: "u" }],
    projector: { name: "mmproj-h.gguf", size: 1, downloadUrl: "u" },
  },
] as const;

describe("projectorPathFromSpecs", () => {
  it("resolves the pair's projector path for a completed vision model", () => {
    assert.equal(
      projectorPathFromSpecs(specs, "v1", "local", "/docs"),
      "/docs/models/mmproj-v-f16.gguf",
    );
  });

  it("a completed model with no projector cannot see — declaration never flips it", () => {
    assert.equal(projectorPathFromSpecs(specs, "t1", "local", "/docs"), undefined);
  });

  it("an INCOMPLETE download cannot see — 'completed' is the pair's proof", () => {
    assert.equal(projectorPathFromSpecs(specs, "half", "local", "/docs"), undefined);
  });

  it("remote providers never resolve a local projector (remote vision is 04)", () => {
    assert.equal(projectorPathFromSpecs(specs, "v1", "remote", "/docs"), undefined);
  });

  it("no active model → no projector", () => {
    assert.equal(projectorPathFromSpecs(specs, null, "local", "/docs"), undefined);
  });
});

describe("the gate flips with the pair", () => {
  it("multimodalAvailable is async and reads the active model's projector", () => {
    const src = readFileSync("store/chat/send.ts", "utf8");
    assert.match(src, /export async function multimodalAvailable/, "seam is now async + real");
    assert.match(src, /activeLocalProjectorPath/, "reads the pair, not a hardcoded false");
    assert.match(src, /await ctx\.multimodalAvailable\(\)/, "the strip awaits the seam");
  });

  it("the engine load receives the projector path", () => {
    const src = readFileSync("store/chat/index.ts", "utf8");
    assert.match(src, /projectorPathForFileName\(/, "ensureEngine resolves the pair");
  });

  it("the engine slot key accounts for the projector", () => {
    const src = readFileSync("lib/inference/manager.ts", "utf8");
    assert.match(src, /mmprojPath/, "stale-context guard: mmproj is part of the key");
  });
});
