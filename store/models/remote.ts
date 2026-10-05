/** Remote-provider slice: OpenAI-compatible APIs + reachability snapshots. */

import type { StateCreator } from "zustand";

import type { ModelStore, RemoteSlice } from "./types";
import { buildRemoteModelSpec, mergeRemoteCaps, probeRemoteCaps, stripMeasuredCaps, validateRemoteApi } from "../../lib/models/remote-api.ts";
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
    set((state) => {
      // C7: caps are keyed per model AND server. Editing either one
      // strips the measured fields (reachability stays) so another
      // identity's context length or vision claim is never believed for
      // this provider — the same guard PocketPal keeps as probedUrl.
      const caps = state.remoteCaps[providerId];
      const current = state.remoteApis.find((p) => p.id === providerId);
      const identityChanged =
        caps !== undefined &&
        ((updates.modelName !== undefined &&
          caps.model !== updates.modelName) ||
          (updates.baseUrl !== undefined &&
            current !== undefined &&
            current.baseUrl !== updates.baseUrl));
      return {
        remoteApis: state.remoteApis.map((p) =>
          p.id === providerId ? { ...p, ...updates } : p,
        ),
        remoteCaps: identityChanged
          ? { ...state.remoteCaps, [providerId]: stripMeasuredCaps(caps) }
          : state.remoteCaps,
      };
    });
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
    // C7: probe only after a successful validation — a server that did
    // not answer is already "unknown", and the probe must never add a
    // second wait to a dead endpoint. probeRemoteCaps never throws
    // (timeout/401/non-2xx/malformed all → {}), so nothing here can
    // reject into the sheet or a turn.
    const probed = ok ? await probeRemoteCaps(provider) : {};
    set((state) => ({
      remoteCaps: {
        ...state.remoteCaps,
        // Field-wise merge: reported fields win, absent fields keep the
        // known values, a different model starts fresh.
        [provider.id]: mergeRemoteCaps(state.remoteCaps[provider.id], {
          reachable: ok,
          checkedAt: Date.now(),
          model: provider.modelName,
          ...probed,
        }),
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
