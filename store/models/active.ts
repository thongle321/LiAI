/** Active-model slice: which model chat/voice should use. */

import type { StateCreator } from "zustand";

import type { ActiveSlice, ModelStore } from "./types";

export const createActiveSlice: StateCreator<ModelStore, [], [], ActiveSlice> = (
  set,
  get,
) => ({
  activeModelId: null,
  activeProviderType: null,
  isContextLoading: false,
  loadingModelId: null,
  lastUsedModelId: null,

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

  setLoadingModel: (modelId) => {
    set({ isContextLoading: modelId !== null, loadingModelId: modelId });
  },

  setLastUsedModel: (modelId) => {
    set({ lastUsedModelId: modelId });
  },

  clearLastUsedModel: () => {
    set({ lastUsedModelId: null });
  },

  activateModel: async (modelOrProviderId: string) => {
    const { remoteApis, setActiveRemoteApi } = get();
    // If it's a remote provider ID, use the existing remote activation path.
    const isRemoteProvider = remoteApis.some((p) => p.id === modelOrProviderId);
    if (isRemoteProvider) {
      setActiveRemoteApi(modelOrProviderId);
      return;
    }
    // Otherwise treat it as a local model ID: route through the eager-load
    // coordinator (supersession, memory gate, calibration all inherited).
    const { getEagerLoad } = await import("@/store/chat.ts");
    await getEagerLoad().load(modelOrProviderId);
  },

  offloadModel: async () => {
    const { getEagerLoad } = await import("@/store/chat.ts");
    await getEagerLoad().offload();
  },
});
