/** Models UI store tests. Run: node --test frontend/tests/models-ui.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createModelsUiStore, UI_STATE_KEY } from "../store/modelsUi.ts";
import type { KeyValueStorage } from "../lib/storage.ts";

function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

describe("models ui store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("starts with both sections open", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.readyOpen, true);
    assert.equal(s.availableOpen, true);
    assert.equal(s.loaded, true);
  });

  it("persists expansion and restores it on load", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    useStore.getState().setOpen("ready", false);
    useStore.getState().setOpen("available", false);
    // persist() is async; wait a tick.
    await new Promise((r) => setTimeout(r, 0));

    const saved = JSON.parse(storage.data[UI_STATE_KEY]);
    assert.equal(saved.readyOpen, false);
    assert.equal(saved.availableOpen, false);
    // No section-visibility state survives: both sections always render.
    assert.equal("readyVisible" in saved, false);
    assert.equal("availableVisible" in saved, false);

    const useStore2 = createModelsUiStore(storage);
    await useStore2.getState().load();
    assert.equal(useStore2.getState().readyOpen, false);
    assert.equal(useStore2.getState().availableOpen, false);
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createModelsUiStore(memoryStorage({ [UI_STATE_KEY]: "not json" }));
    await bad.getState().load();
    assert.equal(bad.getState().readyOpen, true);
    assert.equal(bad.getState().loaded, true);
  });

  it("setAllOpen toggles both groups and persists", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    useStore.getState().setAllOpen(false);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(useStore.getState().readyOpen, false);
    assert.equal(useStore.getState().availableOpen, false);
    assert.equal(JSON.parse(storage.data[UI_STATE_KEY]).readyOpen, false);
  });

  it("starts with PocketPal-mapped filters at defaults", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.downloadedOnly, false);
    assert.equal(s.hfOnly, false);
    assert.equal(s.grouped, true);
  });

  it("persists filters and restores them on load", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    useStore.getState().setFilter("downloadedOnly", true);
    useStore.getState().setFilter("hfOnly", true);
    useStore.getState().setFilter("grouped", false);
    // persist() is async; wait a tick.
    await new Promise((r) => setTimeout(r, 0));

    const saved = JSON.parse(storage.data[UI_STATE_KEY]);
    assert.equal(saved.downloadedOnly, true);
    assert.equal(saved.hfOnly, true);
    assert.equal(saved.grouped, false);

    const useStore2 = createModelsUiStore(storage);
    await useStore2.getState().load();
    assert.equal(useStore2.getState().downloadedOnly, true);
    assert.equal(useStore2.getState().hfOnly, true);
    assert.equal(useStore2.getState().grouped, false);
  });

  it("old payloads without filter keys load with filter defaults", async () => {
    const legacy = memoryStorage({
      [UI_STATE_KEY]: JSON.stringify({
        readyVisible: false,
        availableVisible: true,
        readyOpen: true,
        availableOpen: false,
      }),
    });
    const useStore = createModelsUiStore(legacy);
    await useStore.getState().load();
    const s = useStore.getState();
    // Obsolete visibility keys in a stored payload are ignored, and neither
    // section is suppressed because of them.
    assert.equal(s.readyOpen, true);
    assert.equal(s.availableOpen, false);
    assert.equal(s.downloadedOnly, false);
    assert.equal(s.hfOnly, false);
    assert.equal(s.grouped, true);
  });
});
