/** Active-model slice: which model chat/voice should use. */

import type { StateCreator } from "zustand";

import type { ActiveSlice, ModelStore } from "./types";
import { ACTIVE_MODEL_KEY, asyncStorage } from "./storage";

export const createActiveSlice: StateCreator<ModelStore, [], [], ActiveSlice> = (
  set,
  get,
) => ({
  activeModelId: null,
  activeProviderType: null,

  setActiveModel: (modelId, providerType = "local") => {
    set({ activeModelId: modelId, activeProviderType: providerType });
    asyncStorage.setItem(
      ACTIVE_MODEL_KEY,
      JSON.stringify({ modelId, providerType }),
    );
  },

  getActiveModel: () => {
    const { activeModelId, models } = get();
    if (!activeModelId) return null;
    return models.find((m) => m.id === activeModelId) || null;
  },
});
