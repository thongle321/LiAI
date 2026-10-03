/** Settings slice: HF token + per-model overrides (display name, prompt, stops). */

import type { StateCreator } from "zustand";

import type { ModelStore, SettingsSlice } from "./types";
import { parseModelSettings } from "../../lib/model-settings";
import { activeHfToken } from "../../lib/hf-token";
import { HF_TOKEN_SS_KEY } from "../../lib/secrets";
import { asyncStorage, HF_TOKEN_USE_KEY, MODEL_SETTINGS_KEY, deleteSecret, writeSecret } from "./storage";

export const createSettingsSlice: StateCreator<ModelStore, [], [], SettingsSlice> = (
  set,
  get,
) => ({
  hfToken: null,
  useHfToken: true,
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
    // Persist FIRST, then flip the store: a failed write must not leave
    // the store claiming a token that is not on disk — the sheet's error
    // path (inline "Error saving token", sheet stays open) keys off this.
    if (token) {
      await writeSecret(HF_TOKEN_SS_KEY, token);
    } else {
      await deleteSecret(HF_TOKEN_SS_KEY);
    }
    set({ hfToken: token });
  },

  setUseHfToken: async (on) => {
    set({ useHfToken: on });
    try {
      await asyncStorage.setItem(HF_TOKEN_USE_KEY, on ? "true" : "false");
    } catch (e) {
      console.warn("Failed to save Hugging Face token preference:", e);
    }
  },

  // The one place a token becomes a header: every caller that attaches one
  // goes through here, so the switch cannot be forgotten at a call site.
  activeHfToken: (override) => {
    const { hfToken, useHfToken } = get();
    return activeHfToken({ hfToken, useHfToken }, override);
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
