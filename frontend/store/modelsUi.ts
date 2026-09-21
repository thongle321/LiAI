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

export interface ModelsUiState {
  readyVisible: boolean;
  availableVisible: boolean;
  readyOpen: boolean;
  availableOpen: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setVisible: (section: ModelsUiSection, visible: boolean) => void;
  setOpen: (section: ModelsUiSection, open: boolean) => void;
  setAllOpen: (open: boolean) => void;
}

const DEFAULTS = {
  readyVisible: true,
  availableVisible: true,
  readyOpen: true,
  availableOpen: true,
};

function parseUiState(raw: string | null): typeof DEFAULTS {
  if (!raw) return { ...DEFAULTS };
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ...DEFAULTS };
    const r = v as Record<string, unknown>;
    const flag = (k: string) => (typeof r[k] === "boolean" ? (r[k] as boolean) : true);
    return {
      readyVisible: flag("readyVisible"),
      availableVisible: flag("availableVisible"),
      readyOpen: flag("readyOpen"),
      availableOpen: flag("availableOpen"),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function createModelsUiStore(storage: KeyValueStorage) {
  return create<ModelsUiState>()((set, get) => {
    async function persist(): Promise<void> {
      const { readyVisible, availableVisible, readyOpen, availableOpen } = get();
      try {
        await storage.setItem(
          UI_STATE_KEY,
          JSON.stringify({ readyVisible, availableVisible, readyOpen, availableOpen }),
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
    };
  });
}

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
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
