/** Active-model slice: which model chat/voice should use. */

import type { StateCreator } from "zustand";

import type { ActiveSlice, ModelStore } from "./types";

export const createActiveSlice: StateCreator<ModelStore, [], [], ActiveSlice> = (
  set,
  get,
) => ({
  activeModelId: null,
  activeProviderType: null,

  setActiveModel: (modelId, providerType = "local") => {
    // Unload clears both: a null id with a stranded provider type reads as a
    // half-torn-down active model. Mirrors the remote deactivate path.
    const nextType = modelId === null ? null : providerType;
    // The persist middleware owns the disk; this only moves the state.
    set({ activeModelId: modelId, activeProviderType: nextType });
  },

  getActiveModel: () => {
    const { activeModelId, models } = get();
    if (!activeModelId) return null;
    return models.find((m) => m.id === activeModelId) || null;
  },
});
