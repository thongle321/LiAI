/** Models-screen UI state: group expansion + filters, persisted.
 *
 * Factory takes storage so tests inject memory (see chat.ts pattern).
 * Persist-only-what-exists: filters and expansions that already render.
 *
 * Expansion is keyed by GROUP KEY, not by a fixed pair of sections
 * (PocketParity: PocketPal stores `expandedGroups: Record<type, boolean>`
 * in uiStore and keys it by group key — ModelsScreen.tsx:336-344,
 * UIStore.ts:28-30 — so `grouped` mode can produce a group per model
 * type and each still remembers whether it was open). Only the Ready
 * group starts open, as in the reference.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage";
import {
  AVAILABLE_TO_DOWNLOAD,
  READY_TO_USE,
} from "../lib/models/model-groups.ts";

export const UI_STATE_KEY = "liai_models_ui_v1";

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

function parseUiState(raw: string | null): typeof DEFAULTS {
  if (!raw) return { ...DEFAULTS, expandedGroups: { ...DEFAULT_EXPANDED } };
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return { ...DEFAULTS, expandedGroups: { ...DEFAULT_EXPANDED } };
    }
    const r = v as Record<string, unknown>;
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
  } catch {
    return { ...DEFAULTS, expandedGroups: { ...DEFAULT_EXPANDED } };
  }
}

export function createModelsUiStore(storage: KeyValueStorage) {
  return create<ModelsUiState>()((set, get) => {
    async function persist(): Promise<void> {
      const { expandedGroups, downloadedOnly, hfOnly, grouped, autoNavigateToChat } =
        get();
      try {
        await storage.setItem(
          UI_STATE_KEY,
          JSON.stringify({
            expandedGroups,
            downloadedOnly,
            hfOnly,
            grouped,
            autoNavigateToChat,
          }),
        );
      } catch {
        // Ignore persistence failures; UI state is non-critical.
      }
    }

    return {
      ...DEFAULTS,
      expandedGroups: { ...DEFAULT_EXPANDED },
      loaded: false,
      load: async () => {
        set({ ...parseUiState(await storage.getItem(UI_STATE_KEY)), loaded: true });
      },
      toggleGroup: (key, open) => {
        set({ expandedGroups: { ...get().expandedGroups, [key]: open } });
        void persist();
      },
      setFilter: (filter, value) => {
        set({ [filter]: value });
        void persist();
      },
      setAutoNavigateToChat: (value) => {
        set({ autoNavigateToChat: value });
        void persist();
      },
    };
  });
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
