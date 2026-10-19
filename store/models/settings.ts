/** Settings slice: HF token + per-model overrides (display name, prompt, stops). */

import type { StateCreator } from "zustand";

import type { ModelStore, SettingsSlice } from "./types";
import { parseModelSettings } from "@/utils/model-settings";
import { activeHfToken } from "@/services/auth/hf-token";
import { HF_TOKEN_SS_KEY } from "@/services/auth/secrets";
import { deleteSecret, writeSecret } from "./storage";

export const createSettingsSlice: StateCreator<ModelStore, [], [], SettingsSlice> = (
  set,
  get,
) => ({
  hfToken: null,
  useHfToken: true,
  modelSettings: {},

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
    // The persist middleware owns the disk; this only moves the state.
    set({ useHfToken: on });
  },

  // The one place a token becomes a header: every caller that attaches one
  // goes through here, so the switch cannot be forgotten at a call site.
  activeHfToken: (override) => {
    const { hfToken, useHfToken } = get();
    return activeHfToken({ hfToken, useHfToken }, override);
  },

  resetModelSettings: async () => {
    set({ modelSettings: {} });
    // PocketPal's reset re-merges the catalog, so a preset dismissed this
    // session comes back (ModelStore.ts:3078-3089).
    set({ dismissedPresetIds: [] });
    await get().loadPresets();
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
  },
});
