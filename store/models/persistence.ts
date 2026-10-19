/** Persistence slice: hydrate the store once on app start. */

import type { StateCreator } from "zustand";

import type { KeyValueStorage } from "@/services/storage/storage";
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
  HF_SEARCH_FILTERS_KEY,
  HF_TOKEN_KEY,
  HF_TOKEN_USE_KEY,
  MEMORY_GUARD_KEY,
  MODEL_SETTINGS_KEY,
  PENDING_PROJECTION_CLEANUP_KEY,
  REMOTE_APIS_KEY,
  REMOTE_CAPS_KEY,
  STORAGE_KEY,
  TOOL_COMPAT_WARNED_KEY,
  readSecret,
  writeSecret,
} from "./storage";
import { parseWarnedModelIds } from "./warnings";
import { parseProjectionCleanupQueue } from "./vision-heal";
import {
  DEFAULT_SEARCH_FILTERS,
  persistedState,
  type ModelStateSource,
} from "./persist-shape";

/** The legacy keys this store used to write, one per field. They are read
 *  once, carried into the consolidated blob, and never written again. */
const LEGACY_KEYS = [
  REMOTE_APIS_KEY,
  ACTIVE_MODEL_KEY,
  MODEL_SETTINGS_KEY,
  MEMORY_GUARD_KEY,
  REMOTE_CAPS_KEY,
  HF_TOKEN_USE_KEY,
  TOOL_COMPAT_WARNED_KEY,
  PENDING_PROJECTION_CLEANUP_KEY,
  HF_SEARCH_FILTERS_KEY,
];

export function createPersistenceSlice(
  storage: KeyValueStorage,
): StateCreator<ModelStore, [], [], PersistenceSlice> {
  // Per store instance, not per module: two stores (a second one in a
  // test) must not share a flight.
  let hydrating: Promise<void> | null = null;

  return (set, get, api) => {
    const storeApi = api as unknown as {
      persist: { rehydrate: () => void | Promise<void> };
    };
    return {
      hydrated: false,
      loadPersisted: async () => {
        if (get().hydrated) return;
        hydrating ??= (async () => {
          try {
            await hydrate(set, get, storeApi, storage);
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
}

/** Carry an old install forward, once.
 *
 *  The consolidated blob is the healthy shape: an object with a `state`.
 *  Anything else under STORAGE_KEY is either an old install or the bare
 *  array the catalog slice used to write over the blob — and both are
 *  rebuilt from the legacy keys and written back as the blob.
 *
 *  The legacy keys are read and cleared, never written again: the store
 *  has exactly one writer from here on. */
async function migrateLegacyIfNeeded(storage: KeyValueStorage): Promise<void> {
  const existing = await storage.getItem(STORAGE_KEY);
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
    filtersRaw,
  ] = await Promise.all([
    storage.getItem(STORAGE_KEY), // old: models array (if array-shaped)
    storage.getItem(REMOTE_APIS_KEY),
    storage.getItem(HF_TOKEN_KEY),
    storage.getItem(ACTIVE_MODEL_KEY),
    storage.getItem(MODEL_SETTINGS_KEY),
    storage.getItem(MEMORY_GUARD_KEY),
    storage.getItem(REMOTE_CAPS_KEY),
    storage.getItem(HF_TOKEN_USE_KEY),
    storage.getItem(TOOL_COMPAT_WARNED_KEY),
    storage.getItem(PENDING_PROJECTION_CLEANUP_KEY),
    storage.getItem(HF_SEARCH_FILTERS_KEY),
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
    cleanupRaw ||
    filtersRaw;
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

  const toolCompatWarnedModels = parseWarnedModelIds(warnedRaw);

  const pendingProjectionCleanup = parseProjectionCleanupQueue(cleanupRaw);

  // The saved Hub search filters, when the old install had them.
  let searchFilters = { ...DEFAULT_SEARCH_FILTERS };
  if (filtersRaw) {
    try {
      const parsed = JSON.parse(filtersRaw) as Partial<typeof searchFilters>;
      searchFilters = {
        author: typeof parsed.author === "string" ? parsed.author : "",
        sortBy: parsed.sortBy ?? DEFAULT_SEARCH_FILTERS.sortBy,
      };
    } catch {
      // A corrupt filter blob must not block the upgrade.
    }
  }

  const state: ModelStateSource = {
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
    searchFilters,
  };

  await storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: persistedState(state), version: 0 }),
  );

  // Clear the legacy keys (best-effort). They are read-only from here on.
  for (const k of LEGACY_KEYS) {
    await storage.removeItem(k).catch(() => {});
  }
}

async function hydrate(
  set: (partial: Partial<ModelStore>) => void,
  get: () => ModelStore,
  storeApi: { persist: { rehydrate: () => void | Promise<void> } },
  storage: KeyValueStorage,
): Promise<void> {
  try {
    await migrateLegacyIfNeeded(storage);

    // Rehydrate persisted fields via middleware.
    await storeApi.persist.rehydrate();

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
    }

    // HF token: SecureStore first, legacy AsyncStorage migrates once.
    const ssToken = await readSecret(HF_TOKEN_SS_KEY);
    if (ssToken) {
      set({ hfToken: ssToken });
    } else {
      const legacyTokenRaw = await storage.getItem(HF_TOKEN_KEY).catch(() => null);
      if (legacyTokenRaw) {
        try {
          await writeSecret(HF_TOKEN_SS_KEY, legacyTokenRaw);
          await storage.removeItem(HF_TOKEN_KEY);
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
