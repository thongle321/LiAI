/** Preset dismissal from "Available to Download" (PocketParity: pocketpal
 * ModelStore.removeModelFromList's in-memory splice + reconcilePresets).
 *
 * Run: node --test tests/preset-dismiss.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { create } from "zustand";

import { createCatalogSlice } from "../store/models/catalog.ts";
import type { CatalogSlice } from "../store/models/types.ts";

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

function useTestStore() {
  // The slice is one piece of the full store; the test store is the slice
  // alone, so set/get cast through never to match its ModelStore typing.
  return create<CatalogSlice>()((set, get) =>
    createCatalogSlice(set as never, get as never, {} as never),
  );
}

describe("preset dismissal", () => {
  it("removes the preset from the list and records its id", async () => {
    const store = useTestStore();
    await store.getState().loadPresets();
    const before = store.getState().presets;
    assert.ok(before.length > 0, "the catalog is non-empty");

    const victim = before[0];
    store.getState().dismissPreset(victim.id);

    const s = store.getState();
    assert.equal(
      s.presets.some((p) => p.id === victim.id),
      false,
      "the dismissed preset leaves Available",
    );
    assert.deepEqual(s.dismissedPresetIds, [victim.id]);
    assert.equal(s.presets.length, before.length - 1, "nothing else moved");
  });

  it("keeps a dismissed preset gone across a reload (session-only)", async () => {
    const store = useTestStore();
    await store.getState().loadPresets();
    const victim = store.getState().presets[0];
    store.getState().dismissPreset(victim.id);

    await store.getState().loadPresets();

    const s = store.getState();
    assert.equal(
      s.presets.some((p) => p.id === victim.id),
      false,
      "pull-to-refresh must not resurrect a dismissed preset this session",
    );
    assert.ok(s.presets.length > 0, "the rest of the catalog returns");
  });
});

describe("preset dismissal wiring", () => {
  it("the preset card offers the remove X with pocketpal's confirm", () => {
    // The wording lives in ONE place now — ModelBits' shared confirm —
    // and the card calls it.
    const bits = read("components/models/ModelBits.tsx");
    assert.match(bits, /Remove Model/);
    assert.match(bits, /Are you sure you want to remove this model from the list\?/);
    const src = read("components/models/AvailableModels.tsx");
    assert.match(src, /confirmRemoveModel\(\(\) => dismissPreset/);
    assert.match(src, /Remove \$\{preset\.name\}/);
    // Hidden mid-transfer: pocketpal's download branch is cancel-only.
    assert.match(src, /!transferring \?/);
  });

  it("reset restores dismissed presets like pocketpal's re-merge", () => {
    const src = read("store/models/settings.ts");
    assert.match(src, /resetModelSettings[\s\S]*dismissedPresetIds: \[\]/);
    assert.match(src, /resetModelSettings[\s\S]*await get\(\)\.loadPresets\(\)/);
  });
});
