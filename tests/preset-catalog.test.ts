/** Preset catalog lockdown (static, no network by suite policy).
 *
 * The catalog replaced license-gated repos with verified-ungated mirrors;
 * this locks the shape that verdict depends on: exact-URL well-formedness,
 * known quants, positive sizes, unique ids, tier coverage. Anonymous
 * reachability itself was verified out-of-band with a HEAD probe loop.
 *
 * Tier-coverage decision (C9): a preset missing from every tier FAILS
 * THIS SUITE (option c). AvailableModels deliberately has no runtime
 * fallback — (a) would dump a too-large model under "Light", (b) adds a
 * group UI for a state these tests already prevent, and both catalog and
 * tiers ship as bundled assets that cannot drift once tests pass.
 * Run: node --test tests/preset-catalog.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getPresets } from "../lib/models/huggingface.ts";

const here = dirname(fileURLToPath(import.meta.url));
const tiers = JSON.parse(
  readFileSync(join(here, "..", "assets", "device-tiers.json"), "utf8"),
);

describe("preset catalog", () => {
  it("has unique ids with well-formed resolve URLs, sizes, and quants", async () => {
    const presets = await getPresets();
    assert.ok(presets.length > 0);
    const ids = new Set<string>();
    for (const p of presets) {
      assert.ok(p.id && !ids.has(p.id), `duplicate id ${p.id}`);
      ids.add(p.id);
      assert.ok(p.files.length > 0, `${p.id} has no files`);
      for (const f of p.files) {
        assert.match(f.downloadUrl, /^https:\/\/huggingface\.co\/.+\/resolve\/main\/.+\.gguf$/);
        assert.ok(f.size > 0, `${f.name} size`);
        assert.match(f.quantization ?? "", /^(Q[12468](_0|_K_M)?|Q1_0)$/);
      }
    }
  });

  it("is fully covered by device tiers", async () => {
    const presets = await getPresets();
    const covered = new Set(tiers.flatMap((t: { presetIds: string[] }) => t.presetIds));
    for (const p of presets) {
      assert.ok(covered.has(p.id), `${p.id} missing from tiers`);
    }
  });

  it("tier preset ids all exist in the catalog", async () => {
    // The reverse of coverage: a stale tier id (catalog entry removed)
    // renders nothing forever and no other test notices — the hardcoded
    // list in device-tiers.test.ts tracks the tiers, not the catalog.
    const catalog = new Set((await getPresets()).map((p) => p.id));
    const ids = tiers.flatMap((t: { presetIds: string[] }) => t.presetIds);
    for (const id of ids) {
      assert.ok(catalog.has(id), `tier lists a preset absent from the catalog: ${id}`);
    }
  });

  it("no preset is listed in two tiers", async () => {
    // Duplicates render the same card in two groups on the Models screen.
    const ids = tiers.flatMap((t: { presetIds: string[] }) => t.presetIds);
    assert.equal(ids.length, new Set(ids).size, "a preset appears in two tiers");
  });
});
