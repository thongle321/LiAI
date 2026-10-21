/** The once-per-model notices the app has already shown.
 *
 * PocketPal keeps this set in its UIStore (`toolCompatWarnedModels`); LiAI
 * has no UIStore, and the set is about MODELS anyway, so the model store
 * owns it.
 *
 * The set is persisted: a notice that comes back after every restart is
 * noise, not a warning. The persist middleware owns the disk — this slice
 * only moves the state.
 */

import type { StateCreator } from "zustand";

import type { ModelStore, WarningsSlice } from "./types";

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

export function createWarningsSlice(): StateCreator<
  ModelStore,
  [],
  [],
  WarningsSlice
> {
  return (set, get) => ({
    toolCompatWarnedModels: [],

    hasWarnedToolCompat: (modelId) =>
      get().toolCompatWarnedModels.includes(modelId),

    markToolCompatWarned: (modelId) => {
      // Idempotent: the same model warned twice would write the same list
      // twice, and the warned-set is read on every chat render.
      if (get().toolCompatWarnedModels.includes(modelId)) return;
      set({
        toolCompatWarnedModels: [...get().toolCompatWarnedModels, modelId],
      });
    },
  });
}
