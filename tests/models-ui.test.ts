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

  it("starts with everything visible and open", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.readyVisible, true);
    assert.equal(s.availableVisible, true);
    assert.equal(s.readyOpen, true);
    assert.equal(s.availableOpen, true);
    assert.equal(s.loaded, true);
  });

  it("persists visibility and expansion, restores on load", async () => {
    const useStore = createModelsUiStore(storage);
    await useStore.getState().load();
    useStore.getState().setVisible("ready", false);
    useStore.getState().setOpen("available", false);
    // persist() is async; wait a tick.
    await new Promise((r) => setTimeout(r, 0));

    const saved = JSON.parse(storage.data[UI_STATE_KEY]);
    assert.equal(saved.readyVisible, false);
    assert.equal(saved.availableOpen, false);

    const useStore2 = createModelsUiStore(storage);
    await useStore2.getState().load();
    assert.equal(useStore2.getState().readyVisible, false);
    assert.equal(useStore2.getState().availableOpen, false);
    assert.equal(useStore2.getState().availableVisible, true);
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createModelsUiStore(memoryStorage({ [UI_STATE_KEY]: "not json" }));
    await bad.getState().load();
    assert.equal(bad.getState().readyVisible, true);
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
});
