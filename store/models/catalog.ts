/** Catalog slice: the model list, presets, HF search, and local import. */

import type { StateCreator } from "zustand";

import type {
  CatalogSlice,
  HFSearchError,
  HFSearchFilters,
  ModelStore,
} from "./types";
import { buildLocalModelSpec } from "../../lib/local-model.ts";
import { modelsUsingProjector } from "../../lib/models/vision-pairing.ts";
import {
  buildHfModelSpec,
  getModelFiles as hfGetModelFiles,
  getPresets as hfGetPresets,
  HfError,
  searchModels as hfSearchModels,
} from "../../lib/models/huggingface.ts";
import {
  asyncStorage,
  HF_SEARCH_FILTERS_KEY,
  STORAGE_KEY,
  generateId,
} from "./storage.ts";

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

/** PocketPal's load-more guards: never spam the Hub, and after three
 * short pages in a row stop asking for more. */
let lastLoadMoreAt = 0;
let consecutiveSmallResults = 0;
const SMALL_PAGE = 3;

function toSearchError(error: unknown): HFSearchError {
  if (error instanceof HfError) return { message: error.message, code: error.code };
  return {
    message: error instanceof Error ? error.message : "Search failed",
    code: "unknown",
  };
}

export const createCatalogSlice: StateCreator<ModelStore, [], [], CatalogSlice> = (
  set,
  get,
) => ({
  models: [],
  presets: [],
  searchResults: [],
  searchLoading: false,
  searchLoadingMore: false,
  nextPageLink: null,
  searchError: null,
  /** The query the current results came from, so the token-retry can
   *  re-run the same search instead of clearing the field. */
  searchQuery: "",
  searchFilters: { author: "", sortBy: "relevance" },

  loadPresets: async () => {
    set({ presets: await hfGetPresets() });
  },

  loadSearchFilters: async () => {
    try {
      const raw = await asyncStorage.getItem(HF_SEARCH_FILTERS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<HFSearchFilters>;
      set({
        searchFilters: {
          author: typeof parsed.author === "string" ? parsed.author : "",
          sortBy: parsed.sortBy ?? "relevance",
        },
      });
    } catch {
      // A corrupt filter blob must not block searching.
    }
  },

  setSearchFilters: (patch) => {
    set({ searchFilters: { ...get().searchFilters, ...patch } });
    void asyncStorage
      .setItem(HF_SEARCH_FILTERS_KEY, JSON.stringify(get().searchFilters))
      .catch(() => {});
  },

  searchModels: async (query) => {
    // Clearing the box supersedes whatever is in flight.
    inflightSearch?.abort();
    inflightSearch = null;

    const controller = new AbortController();
    inflightSearch = controller;
    set({ searchLoading: true, searchError: null, searchQuery: query });
    try {
      const { author, sortBy } = get().searchFilters;
      const page = await hfSearchModels(
        query,
        get().activeHfToken() ?? undefined,
        controller.signal,
        { author, sortBy },
      );
      if (controller.signal.aborted) return;
      consecutiveSmallResults = 0;
      lastLoadMoreAt = 0;
      set({
        searchResults: page.results,
        nextPageLink: page.nextPageLink,
        searchLoading: false,
      });
    } catch (error) {
      // An abort is our own doing, not a failure: reporting it would flash
      // "Search failed" over perfectly good results.
      if (controller.signal.aborted) return;
      set({ searchError: toSearchError(error), searchLoading: false });
    } finally {
      if (inflightSearch === controller) inflightSearch = null;
    }
  },

  loadMoreModels: async () => {
    const { nextPageLink, searchLoading, searchLoadingMore } = get();
    if (!nextPageLink || searchLoading || searchLoadingMore) return;
    const since = Date.now() - lastLoadMoreAt;
    if (consecutiveSmallResults >= 3 && since < 5000) return;
    // onEndReached fires on overscroll frames, so without this a fast
    // scroll fires one request per frame.
    if (since < 1000) return;

    lastLoadMoreAt = Date.now();
    set({ searchLoadingMore: true });
    try {
      const { author, sortBy } = get().searchFilters;
      const page = await hfSearchModels(
        "",
        get().activeHfToken() ?? undefined,
        undefined,
        { author, sortBy, pageUrl: nextPageLink },
      );
      consecutiveSmallResults =
        page.results.length < SMALL_PAGE ? consecutiveSmallResults + 1 : 0;
      set((state) => ({
        searchResults: [...state.searchResults, ...page.results],
        nextPageLink: page.nextPageLink,
        searchLoadingMore: false,
      }));
    } catch (error) {
      set({ searchError: toSearchError(error), searchLoadingMore: false });
    }
  },

  disableHfTokenAndRetry: async () => {
    get().setUseHfToken(false);
    await get().searchModels(get().searchQuery);
  },

  getModelFiles: (modelId) =>
    hfGetModelFiles(modelId, get().activeHfToken() ?? undefined),

  bookmarkModel: (result, file) => {
    const spec = buildHfModelSpec(result, file);
    set((state) => ({
      models: [...state.models.filter((m) => m.id !== spec.id), spec],
    }));
    get().saveModels();
  },

  getModelByOid: (oid) =>
    get().models.find((m) => m.files.some((f) => f.oid === oid)),

  isBookmarked: (oid) => get().getModelByOid(oid) !== undefined,

  removeBookmark: (modelId) => {
    const model = get().getModel(modelId);
    // PocketParity: a downloaded file is deleted, never un-bookmarked.
    if (!model || model.downloadStatus === "completed") return false;
    set((state) => ({
      models: state.models.filter((m) => m.id !== modelId),
    }));
    get().saveModels();
    return true;
  },

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
      // Delete local file if exists (downloads in models/, imports in models/local/).
      // The paired projector goes with it (audit finding 6): an mmproj has
      // no owner once the model is deleted, and no other UI path can ever
      // reclaim the hundreds of MB it holds.
      const names = [model.files[0].name, model.projector?.name].filter(
        (name): name is string => typeof name === "string" && name !== "",
      );
      for (const dir of ["models/", "models/local/"]) {
        for (const name of names) {
          const filePath = `${fs.documentDirectory}${dir}${name}`;
          try {
            await fs.deleteAsync(filePath, { idempotent: true });
          } catch {
            // Ignore
          }
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

  setVisionEnabled: (modelId, enabled) => {
    get().updateModel(modelId, { visionEnabled: enabled });
  },

  setProjector: (modelId, projector) => {
    get().updateModel(modelId, { projector, visionEnabled: true });
  },

  detachProjector: async (modelId) => {
    const model = get().getModel(modelId);
    const projector = model?.projector;
    if (!model || !projector) return [];
    // Dependents FIRST: the confirm copy names them, and a shared projector
    // is a real case (two LLMs of one repo can pair the same mmproj).
    const dependents = modelsUsingProjector(get().models, projector.name)
      .filter((m) => m.id !== modelId)
      .map((m) => m.name);
    const fs = await legacyFs();
    try {
      await fs.deleteAsync(
        `${fs.documentDirectory}models/${projector.name}`,
        { idempotent: true },
      );
    } catch {
      // The record is what vision reads; an undeletable file is harmless
      // (nothing loads it) and reported nowhere.
    }
    get().updateModel(modelId, {
      projector: undefined,
      visionEnabled: false,
    });
    return dependents;
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
    const id = `local-${generateId()}`;
    get().addModel(buildLocalModelSpec({ id, fileName, size }));
    // The copy is at rest and complete — read what it says about itself,
    // so an imported model is not second-class to a downloaded one.
    await get().refreshGgufMetadata(id);
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
