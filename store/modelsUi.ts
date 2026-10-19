/** Models-screen UI state: group expansion + filters, persisted.
 *
 * Persisted with Zustand's `persist` middleware over AsyncStorage.
 * `skipHydration` keeps cold-start discipline (manual `rehydrate()`).
 * No version/migrate: breaking changes bump UI_STATE_KEY.
 */

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../services/storage/storage";
import {
  AVAILABLE_TO_DOWNLOAD,
  READY_TO_USE,
} from "../services/models/model-groups.ts";

export const UI_STATE_KEY = "liai_models_ui";

/** PocketPal `filters` mapped onto our groups:
 * - downloadedOnly (PocketPal `downloaded`): only downloaded models.
 * - hfOnly (PocketPal `hf`): HuggingFace-origin models only, remote
 *   providers hidden.
 * - grouped (PocketPal `grouped`): group by model type instead of the two
 *   fixed buckets.
 */
export type ModelsUiFilter = "downloadedOnly" | "hfOnly" | "grouped";

export interface ModelsUiState {
  /** Group key -> open. A key with no entry is closed unless it is the
   *  default-open Ready group (see `isGroupOpen`). */
  expandedGroups: Record<string, boolean>;
  downloadedOnly: boolean;
  hfOnly: boolean;
  grouped: boolean;
  autoNavigateToChat: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  /** Receives the next state, matching the group header's own toggle. */
  toggleGroup: (key: string, open: boolean) => void;
  setFilter: (filter: ModelsUiFilter, value: boolean) => void;
  setAutoNavigateToChat: (value: boolean) => void;
}

/** PocketPal `pageStates.modelsScreen.expandedGroups` (UIStore.ts:28-30):
 *  Ready expanded, everything else collapsed. */
const DEFAULT_EXPANDED: Record<string, boolean> = { [READY_TO_USE]: true };

const DEFAULTS = {
  expandedGroups: DEFAULT_EXPANDED,
  downloadedOnly: false,
  hfOnly: false,
  // PocketPal ships `filters: []` (UIStore.ts:24), so `grouped` starts
  // OFF — the two fixed buckets, with Ready the one open group. Ours
  // started `true` (device-tier grouping) and that default would open the
  // screen on a set of type groups none of which is in the default
  // expansion, i.e. all shut.
  grouped: false,
  /** Jump to the chat after activating a model, so you can start typing. */
  autoNavigateToChat: true,
};

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

interface ModelsUiStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => ModelsUiState;
}

/** Normalize a persisted/raw value into a validated slice. Shared by the
 *  legacy string parser and the persist `merge`. */
function normalizeUiState(raw: unknown): {
  expandedGroups: Record<string, boolean>;
  downloadedOnly: boolean;
  hfOnly: boolean;
  grouped: boolean;
  autoNavigateToChat: boolean;
} {
  const fallback = {
    expandedGroups: { ...DEFAULT_EXPANDED },
    downloadedOnly: false,
    hfOnly: false,
    grouped: false,
    autoNavigateToChat: true,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const r = raw as Record<string, unknown>;
  const flag = (k: string, dflt: boolean) => (isBool(r[k]) ? r[k] : dflt);
  // Old payloads named two fixed sections. Map them onto the group keys
  // so a user's collapse survives the migration; anything older still
  // falls back to the default expansion.
  const legacyGroups: Record<string, boolean> = {};
  if (isBool(r.readyOpen)) legacyGroups[READY_TO_USE] = r.readyOpen;
  if (isBool(r.availableOpen)) {
    legacyGroups[AVAILABLE_TO_DOWNLOAD] = r.availableOpen;
  }
  const rawGroups =
    r.expandedGroups && typeof r.expandedGroups === "object" && !Array.isArray(r.expandedGroups)
      ? (r.expandedGroups as Record<string, unknown>)
      : legacyGroups;
  const expandedGroups: Record<string, boolean> = {};
  for (const [key, open] of Object.entries(rawGroups)) {
    if (isBool(open)) expandedGroups[key] = open;
  }
  return {
    expandedGroups,
    downloadedOnly: flag("downloadedOnly", false),
    hfOnly: flag("hfOnly", false),
    grouped: flag("grouped", false),
    autoNavigateToChat: flag("autoNavigateToChat", true),
  };
}

function parseUiState(raw: string | null): ReturnType<typeof normalizeUiState> {
  if (!raw) return { ...DEFAULTS, expandedGroups: { ...DEFAULT_EXPANDED } };
  try {
    return normalizeUiState(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS, expandedGroups: { ...DEFAULT_EXPANDED } };
  }
}

function toStateStorage(storage: KeyValueStorage): StateStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

export function createModelsUiStore(storage: KeyValueStorage) {
  let api: ModelsUiStoreApi | null = null;

  const created = create<ModelsUiState>()(
    persist(
      (set, get) => ({
        ...DEFAULTS,
        expandedGroups: { ...DEFAULT_EXPANDED },
        loaded: false,
        load: async () => {
          if (get().loaded) return;
          if (!api) return;
          await api.persist.rehydrate();
        },
        toggleGroup: (key, open) => {
          set({ expandedGroups: { ...get().expandedGroups, [key]: open } });
        },
        setFilter: (filter, value) => {
          set({ [filter]: value } as Partial<ModelsUiState>);
        },
        setAutoNavigateToChat: (value) => {
          set({ autoNavigateToChat: value });
        },
      }),
      {
        name: UI_STATE_KEY,
        storage: createJSONStorage(() => toStateStorage(storage)),
        skipHydration: true,
        partialize: (state) => ({
          expandedGroups: state.expandedGroups,
          downloadedOnly: state.downloadedOnly,
          hfOnly: state.hfOnly,
          grouped: state.grouped,
          autoNavigateToChat: state.autoNavigateToChat,
        }),
        merge: (persistedState, currentState) => {
          const validated = normalizeUiState(persistedState);
          return {
            ...currentState,
            ...validated,
            loaded: currentState.loaded,
          };
        },
        onRehydrateStorage: () => (state) => {
          if (state) state.loaded = true;
        },
      },
    ),
  );

  api = created as unknown as ModelsUiStoreApi;
  return created;
}

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the AsyncStorage module's default export is the static singleton;
  // the fallback covers bunders that expose it as the namespace itself.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

/** App singleton backed by on-device AsyncStorage. */
export const useModelsUi = createModelsUiStore({
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
});