/** Persistence slice: hydrate the store once on app start. */

import type { StateCreator } from "zustand";

import type { ModelStore, PersistenceSlice } from "./types";
import { parseModelSettingsMap } from "@/utils/model-settings";
import { platformDownloadService } from "@/services/downloads/download-service";
import { HF_TOKEN_SS_KEY, providerKeySS } from "@/services/auth/secrets";
import {
  upgradeModelList,
  upgradeRemoteApis,
  upgradeRemoteCaps,
} from "@/utils/model-upgrade";
import {
  ACTIVE_MODEL_KEY,
  HF_TOKEN_KEY,
  HF_TOKEN_USE_KEY,
  MEMORY_GUARD_KEY,
  MODEL_SETTINGS_KEY,
  PENDING_PROJECTION_CLEANUP_KEY,
  REMOTE_APIS_KEY,
  REMOTE_CAPS_KEY,
  STORAGE_KEY,
  TOOL_COMPAT_WARNED_KEY,
  asyncStorage,
  readSecret,
  writeSecret,
} from "./storage";
import { parseWarnedModelIds } from "./warnings";
import { parseProjectionCleanupQueue } from "./vision-heal";

let hydrating: Promise<void> | null = null;
let storeApi: { persist: { rehydrate: () => void | Promise<void> } } | null = null;

export const createPersistenceSlice: StateCreator<
  ModelStore,
  [],
  [],
  PersistenceSlice
> = (set, get, api) => {
  storeApi = api as unknown as typeof storeApi;
  return {
    hydrated: false,
    loadPersisted: async () => {
      if (get().hydrated) return;
      hydrating ??= (async () => {
        try {
          await hydrate(set, get);
        } finally {
          set({ hydrated: true });
        }
      })().finally(() => {
        hydrating = null;
      });
      await hydrating;
    },
  };
};

/** Migrate the legacy multi-key storage into the consolidated STORAGE_KEY
 *  blob (one-time). After this runs, STORAGE_KEY holds the new format and
 *  the legacy keys are cleared. */
async function migrateLegacyIfNeeded(): Promise<void> {
  const existing = await asyncStorage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.state &&
        typeof parsed.state === "object"
      ) {
        return; // already consolidated
      }
    } catch {
      // fall through to migration
    }
  }

  const [
    modelsRaw,
    apisRaw,
    legacyTokenRaw,
    activeRaw,
    settingsRaw,
    guardRaw,
    capsRaw,
    useTokenRaw,
    warnedRaw,
    cleanupRaw,
  ] = await Promise.all([
    asyncStorage.getItem(STORAGE_KEY), // old: models array (if array-shaped)
    asyncStorage.getItem(REMOTE_APIS_KEY),
    asyncStorage.getItem(HF_TOKEN_KEY),
    asyncStorage.getItem(ACTIVE_MODEL_KEY),
    asyncStorage.getItem(MODEL_SETTINGS_KEY),
    asyncStorage.getItem(MEMORY_GUARD_KEY),
    asyncStorage.getItem(REMOTE_CAPS_KEY),
    asyncStorage.getItem(HF_TOKEN_USE_KEY),
    asyncStorage.getItem(TOOL_COMPAT_WARNED_KEY),
    asyncStorage.getItem(PENDING_PROJECTION_CLEANUP_KEY),
  ]);

  // Nothing to migrate.
  const hasAnything =
    (modelsRaw && modelsRaw !== "null") ||
    apisRaw ||
    legacyTokenRaw ||
    activeRaw ||
    settingsRaw ||
    guardRaw ||
    capsRaw ||
    useTokenRaw ||
    warnedRaw ||
    cleanupRaw;
  if (!hasAnything) return;

  // Models: old STORAGE_KEY was a JSON array.
  let models: unknown = [];
  if (modelsRaw) {
    try {
      const parsed = JSON.parse(modelsRaw);
      if (Array.isArray(parsed)) models = parsed;
    } catch {
      models = [];
    }
  }

  // Remote apis: migrate plaintext apiKeys to SecureStore.
  let apis: unknown = [];
  if (apisRaw) {
    try {
      const rawList: unknown = JSON.parse(apisRaw);
      if (Array.isArray(rawList)) {
        for (const entry of rawList) {
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: unknown }).id === "string" &&
            typeof (entry as { apiKey?: unknown }).apiKey === "string" &&
            (entry as { apiKey: string }).apiKey !== ""
          ) {
            await writeSecret(
              providerKeySS((entry as { id: string }).id),
              (entry as { apiKey: string }).apiKey,
            );
          }
        }
        apis = rawList;
      }
    } catch {
      apis = [];
    }
  }

  let activeModelId: string | null = null;
  let activeProviderType: "local" | "remote" | null = null;
  if (activeRaw) {
    try {
      const parsed = JSON.parse(activeRaw);
      activeModelId = parsed?.modelId ?? null;
      activeProviderType = parsed?.providerType ?? null;
    } catch {
      // ignore
    }
  }

  let modelSettings: Record<string, unknown> = {};
  if (settingsRaw) {
    try {
      modelSettings = JSON.parse(settingsRaw) ?? {};
    } catch {
      modelSettings = {};
    }
  }

  let largestSuccessfulBytes = 0;
  if (guardRaw) {
    try {
      const g = JSON.parse(guardRaw);
      if (typeof g === "number" && Number.isFinite(g) && g > 0) {
        largestSuccessfulBytes = g;
      }
    } catch {
      // ignore
    }
  }

  let remoteCaps: unknown = {};
  let privacyAcknowledged = false;
  if (capsRaw) {
    try {
      const parsed = JSON.parse(capsRaw);
      if (parsed && typeof parsed === "object") {
        remoteCaps = (parsed as Record<string, unknown>).caps ?? {};
        privacyAcknowledged = (parsed as Record<string, unknown>).privacyAcknowledged === true;
      }
    } catch {
      // ignore
    }
  }

  const useHfToken = useTokenRaw === null ? true : useTokenRaw === "true";

  let toolCompatWarnedModels: string[] = [];
  if (warnedRaw) {
    try {
      toolCompatWarnedModels = JSON.parse(warnedRaw) ?? [];
      if (!Array.isArray(toolCompatWarnedModels)) toolCompatWarnedModels = [];
    } catch {
      toolCompatWarnedModels = [];
    }
  }

  const pendingProjectionCleanup = parseProjectionCleanupQueue(cleanupRaw);

  const state = {
    models: upgradeModelList(models),
    remoteApis: upgradeRemoteApis(apis),
    activeModelId,
    activeProviderType,
    modelSettings: parseModelSettingsMap(JSON.stringify(modelSettings)),
    largestSuccessfulBytes,
    remoteCaps: upgradeRemoteCaps(remoteCaps),
    privacyAcknowledged,
    useHfToken,
    toolCompatWarnedModels,
    pendingProjectionCleanup,
    searchFilters: { author: "", sortBy: "downloads" },
  };

  // Scrub apiKeys from persisted models/remoteApis.
  state.models = state.models.map((m) => ({ ...m, apiKey: undefined }));
  state.remoteApis = state.remoteApis.map((p) => ({ ...p, apiKey: "" }));

  await asyncStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 0 }));

  // Clear legacy keys (best-effort).
  for (const k of [
    REMOTE_APIS_KEY,
    ACTIVE_MODEL_KEY,
    MODEL_SETTINGS_KEY,
    MEMORY_GUARD_KEY,
    REMOTE_CAPS_KEY,
    HF_TOKEN_USE_KEY,
    TOOL_COMPAT_WARNED_KEY,
    PENDING_PROJECTION_CLEANUP_KEY,
  ]) {
    await asyncStorage.removeItem(k).catch(() => {});
  }
}

async function hydrate(
  set: (partial: Partial<ModelStore>) => void,
  get: () => ModelStore,
): Promise<void> {
  try {
    await migrateLegacyIfNeeded();

    // Rehydrate persisted fields via middleware.
    // The store's api reference is captured in persistence.ts? We need api.
    // We'll reach it via a global set during index.ts. Instead, use get().loadPersisted? circular.
    // Approach: persistence slice doesn't have api. We'll call rehydrate through a stored ref.
    if (storeApi) await storeApi.persist.rehydrate();

    // Cleanup queue lands in store before models are parsed (via rehydrate).
    // Secrets: hydrate remote model keys from SecureStore.
    const models = get().models;
    if (models && models.length > 0) {
      for (const m of models) {
        if (m.origin === "remote_api" && m.id.startsWith("remote-")) {
          const key = await readSecret(providerKeySS(m.id.slice("remote-".length)));
          if (key) m.apiKey = key;
        }
      }
      set({ models });
      await get().saveModels();
      await get().reconcileInterrupted();
      const adopted = await platformDownloadService.reconcileWithNative?.();
      for (const modelId of adopted ?? []) {
        const spec = get().models.find((m) => m.id === modelId);
        const job = platformDownloadService.getAllJobs().find((j) => j.modelId === modelId);
        if (spec && job) {
          get().setModelProgress(modelId, {
            downloadStatus: job.status,
            downloadProgress: job.progress,
            downloadedBytes: job.downloadedBytes,
            totalBytes: job.totalBytes,
          });
        }
      }
    }

    // Vision heal + cleanup drain.
    try {
      await get().healDraftVisionClassification();
      await get().drainPendingProjectionCleanup();
    } catch (e) {
      console.warn("Vision heal / projection cleanup failed:", e);
    }

    // Remote apis: hydrate keys from SecureStore.
    const apis = get().remoteApis;
    if (apis && apis.length > 0) {
      // One-time migration: legacy plaintext apiKeys -> SecureStore.
      // (Best-effort: if the blob still carries apiKey, migrate.)
      for (const p of apis) {
        if (p.apiKey && p.apiKey !== "") {
          try {
            await writeSecret(providerKeySS(p.id), p.apiKey);
          } catch {
            // ignore
          }
        }
      }
      for (const p of apis) {
        const key = await readSecret(providerKeySS(p.id));
        if (key) p.apiKey = key;
        else p.apiKey = "";
      }
      set({ remoteApis: apis });
      await get().saveRemoteApis();
    }

    // HF token: SecureStore first, legacy AsyncStorage migrates once.
    const ssToken = await readSecret(HF_TOKEN_SS_KEY);
    if (ssToken) {
      set({ hfToken: ssToken });
    } else {
      const legacyTokenRaw = await asyncStorage.getItem(HF_TOKEN_KEY).catch(() => null);
      if (legacyTokenRaw) {
        try {
          await writeSecret(HF_TOKEN_SS_KEY, legacyTokenRaw);
          await asyncStorage.removeItem(HF_TOKEN_KEY);
          set({ hfToken: legacyTokenRaw });
        } catch {
          // legacy copy stays put
        }
      }
    }

    // loadPresets
    await get().loadPresets();
  } catch (e) {
    console.warn("Failed to load persisted model state:", e);
  }
}
