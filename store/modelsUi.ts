/** Models-screen UI state: section visibility + group expansion, persisted.
 *
 * Factory takes storage so tests inject memory (see chat.ts pattern).
 * Persist-only-what-exists: filters and expansions that already render.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage";

export const UI_STATE_KEY = "liai_models_ui_v1";

export type ModelsUiSection = "ready" | "available";

/** PocketPal `filters` mapped onto our two groups:
 * - downloadedOnly (PocketPal `downloaded`): hide Available, show only Ready.
 * - hfOnly (PocketPal `hf`): Ready shows HuggingFace-origin downloads only,
 *   remote providers hidden. Available presets are all HF-repo-backed, so
 *   that section is unaffected.
 * - grouped (PocketPal `grouped`): Available presets render under device-tier
 *   headers; off renders one flat list. Our Ready/Available split itself is
 *   fixed (PocketPal groups by type instead when `grouped` is set — no
 *   equivalent here; see ModelsScreen).
 */
export type ModelsUiFilter = "downloadedOnly" | "hfOnly" | "grouped";

export interface ModelsUiState {
  readyVisible: boolean;
  availableVisible: boolean;
  readyOpen: boolean;
  availableOpen: boolean;
  downloadedOnly: boolean;
  hfOnly: boolean;
  grouped: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setVisible: (section: ModelsUiSection, visible: boolean) => void;
  setOpen: (section: ModelsUiSection, open: boolean) => void;
  setAllOpen: (open: boolean) => void;
  setFilter: (filter: ModelsUiFilter, value: boolean) => void;
}

const DEFAULTS = {
  readyVisible: true,
  availableVisible: true,
  readyOpen: true,
  availableOpen: true,
  downloadedOnly: false,
  hfOnly: false,
  grouped: true,
};

function parseUiState(raw: string | null): typeof DEFAULTS {
  if (!raw) return { ...DEFAULTS };
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ...DEFAULTS };
    const r = v as Record<string, unknown>;
    const flag = (k: string, dflt: boolean) =>
      typeof r[k] === "boolean" ? (r[k] as boolean) : dflt;
    return {
      readyVisible: flag("readyVisible", true),
      availableVisible: flag("availableVisible", true),
      readyOpen: flag("readyOpen", true),
      availableOpen: flag("availableOpen", true),
      // Old payloads predate filters: fall back to defaults (compat).
      downloadedOnly: flag("downloadedOnly", false),
      hfOnly: flag("hfOnly", false),
      grouped: flag("grouped", true),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function createModelsUiStore(storage: KeyValueStorage) {
  return create<ModelsUiState>()((set, get) => {
    async function persist(): Promise<void> {
      const {
        readyVisible,
        availableVisible,
        readyOpen,
        availableOpen,
        downloadedOnly,
        hfOnly,
        grouped,
      } = get();
      try {
        await storage.setItem(
          UI_STATE_KEY,
          JSON.stringify({
            readyVisible,
            availableVisible,
            readyOpen,
            availableOpen,
            downloadedOnly,
            hfOnly,
            grouped,
          }),
        );
      } catch {
        // Ignore persistence failures; UI state is non-critical.
      }
    }

    return {
      ...DEFAULTS,
      loaded: false,
      load: async () => {
        const parsed = parseUiState(await storage.getItem(UI_STATE_KEY));
        set({ ...parsed, loaded: true });
      },
      setVisible: (section, visible) => {
        set(section === "ready" ? { readyVisible: visible } : { availableVisible: visible });
        void persist();
      },
      setOpen: (section, open) => {
        set(section === "ready" ? { readyOpen: open } : { availableOpen: open });
        void persist();
      },
      setAllOpen: (open) => {
        set({ readyOpen: open, availableOpen: open });
        void persist();
      },
      setFilter: (filter, value) => {
        set({ [filter]: value });
        void persist();
      },
    };
  });
}

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the AsyncStorage module's default export is the static singleton;
  // the fallback covers bundlers that expose it as the namespace itself.
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
