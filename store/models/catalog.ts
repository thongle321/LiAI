/** Catalog slice: the model list, presets, HF search, and local import. */

import type { StateCreator } from "zustand";
import * as LegacyFileSystem from "expo-file-system/legacy";

import type { CatalogSlice, ModelStore } from "./types";
import { buildLocalModelSpec } from "../../lib/local-model";
import {
  getModelFiles as hfGetModelFiles,
  getPresets as hfGetPresets,
  searchModels as hfSearchModels,
} from "../../lib/models/huggingface";
import { asyncStorage, STORAGE_KEY, generateId } from "./storage";

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
    if (!query.trim()) {
      set({ searchResults: [], searchError: null });
      return;
    }

    set({ searchLoading: true, searchError: null });
    try {
      const results = await hfSearchModels(query, get().hfToken ?? undefined);
      set({ searchResults: results, searchLoading: false });
    } catch (error) {
      set({
        searchError: error instanceof Error ? error.message : "Search failed",
        searchLoading: false,
      });
    }
  },

  getModelFiles: (modelId) =>
    hfGetModelFiles(modelId, get().hfToken ?? undefined),

  addModel: (model) => {
    set((state) => ({
      models: [...state.models.filter((m) => m.id !== model.id), model],
    }));
    get().saveModels();
  },

  removeModel: async (modelId) => {
    const model = get().getModel(modelId);
    if (model && model.origin !== "remote_api" && model.files[0]) {
      // Delete local file if exists (downloads in models/, imports in models/local/)
      for (const dir of ["models/", "models/local/"]) {
        const filePath = `${LegacyFileSystem.documentDirectory}${dir}${model.files[0].name}`;
        try {
          await LegacyFileSystem.deleteAsync(filePath, { idempotent: true });
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
    const base = LegacyFileSystem.documentDirectory ?? "";
    const dir = `${base}models/local/`;
    try {
      const info = await LegacyFileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await LegacyFileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      await LegacyFileSystem.copyAsync({ from: sourceUri, to: `${dir}${fileName}` });
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
