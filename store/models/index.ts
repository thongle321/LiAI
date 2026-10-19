/** Model management store, composed from focused slices.
 *
 * Persisted with Zustand's `persist` middleware over AsyncStorage. `skipHydration`
 * keeps cold-start discipline (manual `loadPersisted()`). No version/migrate:
 * breaking changes bump STORAGE_KEY.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { KeyValueStorage } from "@/services/storage/storage";
import { toStateStorage } from "@/services/storage/persist-helpers";

import type { ModelStore } from "./types";
import type { HFSearchFilters } from "./types";
import type { ModelSettings } from "@/types/models";
import { createActiveSlice } from "./active";
import { createCatalogSlice } from "./catalog";
import { createDownloadsSlice } from "./downloads";
import { createPersistenceSlice } from "./persistence";
import { createRemoteSlice } from "./remote";
import { createSettingsSlice } from "./settings";
import { createWarningsSlice } from "./warnings";
import { createVisionHealSlice } from "./vision-heal";
import { STORAGE_KEY } from "./storage";
import { upgradeModelList, upgradeRemoteApis, upgradeRemoteCaps } from "@/utils/model-upgrade";

export type { ModelStore } from "./types";

export function createModelStore(storage: KeyValueStorage) {
  let persistEnabled = false;

  const gatedStorage = {
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) =>
      persistEnabled ? storage.setItem(key, value) : Promise.resolve(),
    removeItem: (key: string) => storage.removeItem(key),
  };

  const created = create<ModelStore>()(
    persist(
      (...a) => ({
        ...createCatalogSlice(...a),
        ...createDownloadsSlice(...a),
        ...createRemoteSlice(...a),
        ...createSettingsSlice(...a),
        ...createActiveSlice(...a),
        ...createWarningsSlice()(...a),
        ...createVisionHealSlice()(...a),
        ...createPersistenceSlice(...a),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => toStateStorage(gatedStorage)),
        skipHydration: true,
        partialize: (state: ModelStore) => ({
          models: state.models.map((m) => ({ ...m, apiKey: undefined })),
          remoteApis: state.remoteApis.map((p) => ({ ...p, apiKey: "" })),
          activeModelId: state.activeModelId,
          activeProviderType: state.activeProviderType,
          modelSettings: state.modelSettings,
          largestSuccessfulBytes: state.largestSuccessfulBytes,
          remoteCaps: state.remoteCaps,
          privacyAcknowledged: state.privacyAcknowledged,
          useHfToken: state.useHfToken,
          toolCompatWarnedModels: state.toolCompatWarnedModels,
          pendingProjectionCleanup: state.pendingProjectionCleanup,
          searchFilters: state.searchFilters,
        }),
        merge: (persistedState, currentState) => {
          const r =
            persistedState && typeof persistedState === "object" && !Array.isArray(persistedState)
              ? (persistedState as Record<string, unknown>)
              : {};
          const models = Array.isArray(r.models)
            ? upgradeModelList(r.models)
            : currentState.models;
          const remoteApis = Array.isArray(r.remoteApis)
            ? upgradeRemoteApis(r.remoteApis)
            : currentState.remoteApis;
          const capsRaw = r.remoteCaps;
          const remoteCaps =
            capsRaw && typeof capsRaw === "object"
              ? upgradeRemoteCaps(capsRaw)
              : currentState.remoteCaps;
          return {
            ...currentState,
            models,
            remoteApis,
            activeModelId:
              typeof r.activeModelId === "string" || r.activeModelId === null
                ? (r.activeModelId as string | null)
                : currentState.activeModelId,
            activeProviderType:
              r.activeProviderType === "local" ||
              r.activeProviderType === "remote" ||
              r.activeProviderType === null
                ? (r.activeProviderType as "local" | "remote" | null)
                : currentState.activeProviderType,
            modelSettings:
              r.modelSettings && typeof r.modelSettings === "object"
                ? (r.modelSettings as Record<string, ModelSettings>)
                : currentState.modelSettings,
            largestSuccessfulBytes:
              typeof r.largestSuccessfulBytes === "number"
                ? r.largestSuccessfulBytes
                : currentState.largestSuccessfulBytes,
            remoteCaps,
            privacyAcknowledged:
              typeof r.privacyAcknowledged === "boolean"
                ? r.privacyAcknowledged
                : currentState.privacyAcknowledged,
            useHfToken:
              typeof r.useHfToken === "boolean" ? r.useHfToken : currentState.useHfToken,
            toolCompatWarnedModels: Array.isArray(r.toolCompatWarnedModels)
              ? (r.toolCompatWarnedModels as string[])
              : currentState.toolCompatWarnedModels,
            pendingProjectionCleanup: Array.isArray(r.pendingProjectionCleanup)
              ? (r.pendingProjectionCleanup as string[])
              : currentState.pendingProjectionCleanup,
            searchFilters:
              r.searchFilters && typeof r.searchFilters === "object"
                ? (r.searchFilters as HFSearchFilters)
                : currentState.searchFilters,
            hydrated: currentState.hydrated,
          };
        },
        onRehydrateStorage: () => () => {
          persistEnabled = true;
        },
      },
    ),
  );

  return created;
}
