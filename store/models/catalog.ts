/** Catalog slice: the model list, presets, HF search, and local import. */

import type { StateCreator } from "zustand";

import type { CatalogSlice, ModelStore } from "./types";
import { buildLocalModelSpec } from "../../lib/local-model.ts";
import {
  getModelFiles as hfGetModelFiles,
  getPresets as hfGetPresets,
  searchModels as hfSearchModels,
} from "../../lib/models/huggingface.ts";
import { asyncStorage, STORAGE_KEY, generateId } from "./storage.ts";

/** The legacy FS module, loaded on demand like storage.ts's rnStorage().
 * A top-level import of a native module makes this whole slice unloadable
 * in node, which costs the search-race regression test; only the two file
 * operations below ever need it. */
const legacyFs = () => import("expo-file-system/legacy");

/** The search currently on the wire. A newer search aborts the older one,
 * and the older one is ignored even if it still resolves: Hub latency
 * varies seconds, so without this a slow reply for "qwen" lands after the
 * reply for "qwen2" and the user sees results for a query they replaced. */
let inflightSearch: AbortController | null = null;

export const createCatalogSlice: StateCreator<ModelStore, [], [], CatalogSlice> = (
  set,
  get,
) => ({
  models: [],
  presets: [],
  searchResults: [],
  searchLoading: false,
  searchError: null,

  loadPresets: async () => {
    set({ presets: await hfGetPresets() });
  },

  searchModels: async (query) => {
    // Clearing the box supersedes whatever is in flight.
    inflightSearch?.abort();
    inflightSearch = null;

    if (!query.trim()) {
      set({ searchResults: [], searchError: null, searchLoading: false });
      return;
    }

    const controller = new AbortController();
    inflightSearch = controller;
    set({ searchLoading: true, searchError: null });
    try {
      const results = await hfSearchModels(
        query,
        get().activeHfToken() ?? undefined,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      set({ searchResults: results, searchLoading: false });
    } catch (error) {
      // An abort is our own doing, not a failure: reporting it would flash
      // "Search failed" over perfectly good results.
      if (controller.signal.aborted) return;
      set({
        searchError: error instanceof Error ? error.message : "Search failed",
        searchLoading: false,
      });
    } finally {
      if (inflightSearch === controller) inflightSearch = null;
    }
  },

  getModelFiles: (modelId) =>
    hfGetModelFiles(modelId, get().activeHfToken() ?? undefined),

  addModel: (model) => {
    set((state) => ({
      models: [...state.models.filter((m) => m.id !== model.id), model],
    }));
    get().saveModels();
  },

  removeModel: async (modelId) => {
    const model = get().getModel(modelId);
    if (model && model.origin !== "remote_api" && model.files[0]) {
      const fs = await legacyFs();
      // Delete local file if exists (downloads in models/, imports in models/local/)
      for (const dir of ["models/", "models/local/"]) {
        const filePath = `${fs.documentDirectory}${dir}${model.files[0].name}`;
        try {
          await fs.deleteAsync(filePath, { idempotent: true });
        } catch {
          // Ignore
        }
      }
    }

    set((state) => ({
      models: state.models.filter((m) => m.id !== modelId),
      activeModelId: state.activeModelId === modelId ? null : state.activeModelId,
    }));
    get().saveModels();
  },

  updateModel: (modelId, updates) => {
    set((state) => ({
      models: state.models.map((m) =>
        m.id === modelId ? { ...m, ...updates } : m,
      ),
    }));
    get().saveModels();
  },

  // Download ticks fire many times a second; persisting each one
  // JSON-stringifies the whole catalog to AsyncStorage on every tick and
  // tanks the models screen. Progress is ephemeral UI state (resume reads
  // the partial file on disk, not this field), so update memory only. Real
  // transitions (complete/pause/fail) still go through updateModel.
  setModelProgress: (modelId, progress) => {
    set((state) => ({
      models: state.models.map((m) =>
        m.id === modelId ? { ...m, ...progress } : m,
      ),
    }));
  },

  getModel: (modelId) => get().models.find((m) => m.id === modelId),

  addLocalModel: async (sourceUri, fileName, size) => {
    const fs = await legacyFs();
    const base = fs.documentDirectory ?? "";
    const dir = `${base}models/local/`;
    try {
      const info = await fs.getInfoAsync(dir);
      if (!info.exists) {
        await fs.makeDirectoryAsync(dir, { intermediates: true });
      }
      await fs.copyAsync({ from: sourceUri, to: `${dir}${fileName}` });
    } catch (e) {
      console.warn("Failed to copy local model file:", e);
      throw e instanceof Error ? e : new Error("Copy failed");
    }

    // ponytail: replace reuses the file name — drop the stale row first.
    set((state) => ({
      models: state.models.filter(
        (m) => !(m.origin === "local" && m.files[0]?.name === fileName),
      ),
    }));
    get().addModel(
      buildLocalModelSpec({ id: `local-${generateId()}`, fileName, size }),
    );
  },

  saveModels: async () => {
    try {
      // ponytail: remote apiKeys hydrate in memory only — never persist them.
      const scrubbed = get().models.map((m) =>
        m.origin === "remote_api" ? { ...m, apiKey: "" } : m,
      );
      await asyncStorage.setItem(STORAGE_KEY, JSON.stringify(scrubbed));
    } catch (e) {
      console.warn("Failed to save models:", e);
    }
  },
});
