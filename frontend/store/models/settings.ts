/** Settings slice: HF token + per-model overrides (display name, prompt, stops). */

import type { StateCreator } from "zustand";

import type { ModelStore, SettingsSlice } from "./types";
import { parseModelSettings } from "../../lib/model-settings";
import { HF_TOKEN_SS_KEY } from "../../lib/secrets";
import { asyncStorage, MODEL_SETTINGS_KEY, deleteSecret, writeSecret } from "./storage";

export const createSettingsSlice: StateCreator<ModelStore, [], [], SettingsSlice> = (
  set,
  get,
) => ({
  hfToken: null,
  modelSettings: {},

  saveModelSettings: async () => {
    try {
      await asyncStorage.setItem(
        MODEL_SETTINGS_KEY,
        JSON.stringify(get().modelSettings),
      );
    } catch (e) {
      console.warn("Failed to save model settings:", e);
    }
  },

  setHfToken: async (token) => {
    set({ hfToken: token });
    if (token) {
      await writeSecret(HF_TOKEN_SS_KEY, token);
    } else {
      await deleteSecret(HF_TOKEN_SS_KEY);
    }
  },

  getModelSettings: (modelId) => parseModelSettings(get().modelSettings[modelId]),

  updateModelSettings: (modelId, updates) => {
    set((state) => ({
      modelSettings: {
        ...state.modelSettings,
        [modelId]: parseModelSettings({
          ...state.modelSettings[modelId],
          ...updates,
        }),
      },
    }));
    get().saveModelSettings();
  },
});
