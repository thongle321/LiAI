/** Warnings slice: the once-per-model notices the app has already shown.
 *
 * PocketPal keeps this set in its UIStore (`toolCompatWarnedModels`); LiAI
 * has no UIStore, and the set is about MODELS anyway, so the model store
 * owns it.
 *
 * The set is persisted: a notice that comes back after every restart is
 * noise, not a warning. The storage is injected for the same reason
 * `createInferenceStore(storage)` takes one — so the round-trip can be
 * covered without a native module in the loop.
 */

import type { StateCreator } from "zustand";

import type { ModelStore, WarningsSlice } from "./types";
import type { KeyValueStorage } from "@/services/storage/storage";
import { asyncStorage, TOOL_COMPAT_WARNED_KEY } from "./storage.ts";

/** Read the persisted warned-set out of a raw payload.
 *
 *  Pure, so the persistence slice can parse the key it read alongside the
 *  others. A corrupt payload is an empty set, never a crash: the notice
 *  is a nicety, and losing it costs one duplicate warning. */
export function parseWarnedModelIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function createWarningsSlice(
  storage: KeyValueStorage = asyncStorage,
): StateCreator<ModelStore, [], [], WarningsSlice> {
  return (set, get) => ({
    toolCompatWarnedModels: [],

    hasWarnedToolCompat: (modelId) => get().toolCompatWarnedModels.includes(modelId),

    markToolCompatWarned: (modelId) => {
      // Idempotent: the same model warned twice would write the same list
      // twice, and the warned-set is read on every chat render.
      if (get().toolCompatWarnedModels.includes(modelId)) return;
      set({ toolCompatWarnedModels: [...get().toolCompatWarnedModels, modelId] });
      void get().saveToolCompatWarned();
    },

    saveToolCompatWarned: async () => {
      try {
        await storage.setItem(
          TOOL_COMPAT_WARNED_KEY,
          JSON.stringify(get().toolCompatWarnedModels),
        );
      } catch (e) {
        // A failed write costs one repeated warning, never a broken notice.
        console.warn("Failed to save tool-compat warned set:", e);
      }
    },
  });
}
