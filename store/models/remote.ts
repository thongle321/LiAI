/** Remote-provider slice: OpenAI-compatible APIs + reachability snapshots. */

import type { StateCreator } from "zustand";

import type { ModelStore, RemoteSlice } from "./types";
import { buildRemoteModelSpec, validateRemoteApi } from "../../lib/models/remote-api.ts";
import { providerKeySS } from "../../lib/secrets.ts";
import {
  ACTIVE_MODEL_KEY,
  asyncStorage,
  REMOTE_APIS_KEY,
  REMOTE_CAPS_KEY,
  deleteSecret,
  writeSecret,
} from "./storage.ts";

export const createRemoteSlice: StateCreator<ModelStore, [], [], RemoteSlice> = (
  set,
  get,
) => ({
  remoteApis: [],
  remoteCaps: {},
  privacyAcknowledged: false,

  saveRemoteApis: async () => {
    try {
      // ponytail: apiKeys live in SecureStore — persist metadata only.
      const scrubbed = get().remoteApis.map((p) => ({ ...p, apiKey: "" }));
      await asyncStorage.setItem(REMOTE_APIS_KEY, JSON.stringify(scrubbed));
    } catch (e) {
      console.warn("Failed to save remote APIs:", e);
    }
  },

  saveRemoteCaps: async () => {
    try {
      await asyncStorage.setItem(
        REMOTE_CAPS_KEY,
        JSON.stringify({
          caps: get().remoteCaps,
          privacyAcknowledged: get().privacyAcknowledged,
        }),
      );
    } catch (e) {
      console.warn("Failed to save remote caps:", e);
    }
  },

  addRemoteApi: async (provider) => {
    set((state) => ({
      remoteApis: [...state.remoteApis.filter((p) => p.id !== provider.id), provider],
    }));
    if (provider.apiKey !== "") {
      await writeSecret(providerKeySS(provider.id), provider.apiKey);
    }
    get().saveRemoteApis();
  },

  removeRemoteApi: async (providerId) => {
    // Active ids carry the remote- prefix (buildRemoteModelSpec); compare
    // against it or a deleted provider leaves a stale active ref behind.
    const activeId = `remote-${providerId}`;
    set((state) => ({
      remoteApis: state.remoteApis.filter((p) => p.id !== providerId),
      activeModelId:
        state.activeModelId === activeId ? null : state.activeModelId,
      activeProviderType:
        state.activeModelId === activeId ? null : state.activeProviderType,
    }));
    await deleteSecret(providerKeySS(providerId));
    get().saveRemoteApis();
  },

  updateRemoteApi: async (providerId, updates) => {
    set((state) => ({
      remoteApis: state.remoteApis.map((p) =>
        p.id === providerId ? { ...p, ...updates } : p,
      ),
    }));
    if (updates.apiKey !== undefined && updates.apiKey !== "") {
      await writeSecret(providerKeySS(providerId), updates.apiKey);
    } else if (updates.apiKey === "") {
      // ponytail: blanking the key must wipe SecureStore or it rehydrates.
      await deleteSecret(providerKeySS(providerId));
    }
    get().saveRemoteApis();
  },

  setActiveRemoteApi: (providerId) => {
    const provider = providerId
      ? get().remoteApis.find((p) => p.id === providerId)
      : null;

    if (provider) {
      const modelSpec = buildRemoteModelSpec(provider);
      get().addModel(modelSpec);
      get().setActiveModel(modelSpec.id, "remote");
    } else {
      set({ activeModelId: null, activeProviderType: null });
      asyncStorage.removeItem(ACTIVE_MODEL_KEY);
    }
  },

  validateRemoteApi: (provider) => validateRemoteApi(provider),

  validateAndRecord: async (provider) => {
    const ok = await validateRemoteApi(provider);
    set((state) => ({
      remoteCaps: {
        ...state.remoteCaps,
        [provider.id]: { reachable: ok, checkedAt: Date.now() },
      },
    }));
    void get().saveRemoteCaps();
    return ok;
  },

  acknowledgePrivacy: () => {
    set({ privacyAcknowledged: true });
    void get().saveRemoteCaps();
  },
});
