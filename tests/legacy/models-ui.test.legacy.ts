/** Models UI store tests. Run: node --test frontend/tests/models-ui.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createModelsUiStore, UI_STATE_KEY } from "../store/modelsUi.ts";
import { READY_TO_USE, AVAILABLE_TO_DOWNLOAD } from "../lib/models/model-groups.ts";
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

  it("starts with only the Ready group open", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    // PocketPal's default expansion (UIStore.ts:28-30): ready_to_use open.
    assert.equal(s.expandedGroups[READY_TO_USE], true);
    assert.equal(s.expandedGroups["available_to_download"], undefined);
    assert.equal(s.loaded, true);
  });

  it("persists a group's expansion and restores it on load", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    useStore.getState().toggleGroup(READY_TO_USE, false);
    useStore.getState().toggleGroup("llm", true);
    // persist() is async; wait a tick.
    await new Promise((r) => setTimeout(r, 0));

    const saved = JSON.parse(storage.data[UI_STATE_KEY]);
    assert.equal(saved.expandedGroups[READY_TO_USE], false);
    assert.equal(saved.expandedGroups.llm, true);

    const useStore2 = createModelsUiStore(storage);
    await useStore2.getState().load();
    assert.equal(useStore2.getState().expandedGroups[READY_TO_USE], false);
    assert.equal(useStore2.getState().expandedGroups.llm, true);
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createModelsUiStore(memoryStorage({ [UI_STATE_KEY]: "not json" }));
    await bad.getState().load();
    assert.equal(bad.getState().expandedGroups[READY_TO_USE], true);
    assert.equal(bad.getState().loaded, true);
  });

  it("keys expansion by group type, so grouped mode gets its own state", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    useStore.getState().toggleGroup("vision", true);
    assert.equal(useStore.getState().expandedGroups.vision, true);
    assert.equal(useStore.getState().expandedGroups[READY_TO_USE], true);
  });

  it("starts with PocketPal-mapped filters at defaults", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.downloadedOnly, false);
    assert.equal(s.hfOnly, false);
    // PocketPal ships `filters: []`, so `grouped` starts off.
    assert.equal(s.grouped, false);
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
    // The two legacy section keys map onto the group keys, so a user's
    // collapse survives the migration.
    assert.equal(s.expandedGroups[READY_TO_USE], true);
    assert.equal(s.expandedGroups[AVAILABLE_TO_DOWNLOAD], false);
    assert.equal("readyOpen" in s, false);
    assert.equal(s.downloadedOnly, false);
    assert.equal(s.hfOnly, false);
    assert.equal(s.grouped, false);
  });
});
