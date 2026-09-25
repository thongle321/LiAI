/** Preset catalog lockdown (static, no network by suite policy).
 *
 * The catalog replaced license-gated repos with verified-ungated mirrors;
 * this locks the shape that verdict depends on: exact-URL well-formedness,
 * known quants, positive sizes, unique ids, tier coverage. Anonymous
 * reachability itself was verified out-of-band with a HEAD probe loop.
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
});
