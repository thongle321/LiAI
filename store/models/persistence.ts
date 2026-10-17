/** Persistence slice: hydrate the store once on app start. */

import type { StateCreator } from "zustand";

import type { ModelStore, PersistenceSlice } from "./types";
import { parseModelSettingsMap } from "../../utils/model-settings";
import { platformDownloadService } from "../../services/downloads/download-service";
import { HF_TOKEN_SS_KEY, providerKeySS } from "../../services/auth/secrets";
import {
  upgradeModelList,
  upgradeRemoteApis,
  upgradeRemoteCaps,
} from "../../utils/model-upgrade";
import {
  ACTIVE_MODEL_KEY,
  HF_TOKEN_KEY,
  HF_TOKEN_USE_KEY,
  MEMORY_GUARD_KEY,
  MODEL_SETTINGS_KEY,
  REMOTE_APIS_KEY,
  REMOTE_CAPS_KEY,
  STORAGE_KEY,
  asyncStorage,
  readSecret,
  writeSecret,
} from "./storage";

/** The in-flight hydration, if any. Module scope because the slice is created
 * once per store while `loadPersisted` is called from four different screens. */
let hydrating: Promise<void> | null = null;

export const createPersistenceSlice: StateCreator<
  ModelStore,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  hydrated: false,
  loadPersisted: async () => {
    // Single-flight, and it has to be. Four screens hydrate on mount (the
    // startup gate, Models, onboarding's model step, the token settings card),
    // so an unguarded read re-read eight KV keys plus SecureStore on each -
    // and, worse, replaced the in-memory `models` array with the persisted
    // snapshot on every visit, clobbering live `setModelProgress` values and
    // re-running the native reconcile. The store is the source of truth once
    // hydrated and nothing writes these keys from outside this slice, so a
    // repeat call has nothing left to fetch. Mirrors the inference store's
    // `hydrating` (store/inference.ts).
    if (get().hydrated) return;
    hydrating ??= (async () => {
      try {
        await hydrate(set, get);
      } finally {
        // Set even on failure: a store that never resolves would hold the
        // splash forever, and an empty catalog is a usable state the user can
        // fix from the Models screen.
        set({ hydrated: true });
      }
    })().finally(() => {
      hydrating = null;
    });
    await hydrating;
  },
});

/** The read itself, kept out of the slice so the guard above is the only thing
 * the store has to reason about. */
async function hydrate(
  set: (partial: Partial<ModelStore>) => void,
  get: () => ModelStore,
): Promise<void> {
  try {
    const [
      modelsRaw,
      apisRaw,
      legacyTokenRaw,
      activeRaw,
      settingsRaw,
      guardRaw,
      capsRaw,
    useTokenRaw,
  ] = await Promise.all([
    asyncStorage.getItem(STORAGE_KEY),
    asyncStorage.getItem(REMOTE_APIS_KEY),
    asyncStorage.getItem(HF_TOKEN_KEY),
    asyncStorage.getItem(ACTIVE_MODEL_KEY),
    asyncStorage.getItem(MODEL_SETTINGS_KEY),
    asyncStorage.getItem(MEMORY_GUARD_KEY),
    asyncStorage.getItem(REMOTE_CAPS_KEY),
    asyncStorage.getItem(HF_TOKEN_USE_KEY),
  ]);

  if (modelsRaw) {
      let models: ReturnType<typeof upgradeModelList> | null = null;
      try {
        models = upgradeModelList(JSON.parse(modelsRaw));
      } catch {
        // Corrupt payload only: start empty rather than crash. Platform
        // reconcile failures must not wipe the catalog (D3-8).
        set({ models: [] });
        models = null;
      }
      if (models) {
        try {
          // Hydrate remote model keys from SecureStore (never persisted in KV).
          for (const m of models) {
            if (m.origin === "remote_api" && m.id.startsWith("remote-")) {
              const key = await readSecret(providerKeySS(m.id.slice("remote-".length)));
              if (key) m.apiKey = key;
            }
          }
          set({ models });
          // Persist scrubbed form immediately so a legacy plaintext provider
          // key never lingers in AsyncStorage (D3-2, mirrors saveRemoteApis).
          get().saveModels();
          // Killed downloads leave partial files: mark them paused so the
          // manual Resume button continues from kept bytes (no auto-start).
          await get().reconcileInterrupted();
          // THEN ask the platform what is still running.
          const adopted = await platformDownloadService.reconcileWithNative?.();
          for (const modelId of adopted ?? []) {
            const spec = get().models.find((m) => m.id === modelId);
            const job = platformDownloadService
              .getAllJobs()
              .find((j) => j.modelId === modelId);
            if (spec && job) {
              get().setModelProgress(modelId, {
                downloadStatus: job.status,
                downloadProgress: job.progress,
                downloadedBytes: job.downloadedBytes,
                totalBytes: job.totalBytes,
              });
            }
          }
        } catch {
          // Platform reconcile failed: keep the hydrated catalog rather than
          // wiping it; the next load can retry.
          set({ models });
        }
      }
    }

    if (apisRaw) {
      try {
        const rawList: unknown = JSON.parse(apisRaw);
        // One-time migration: legacy plaintext apiKeys move to SecureStore.
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
        }
        const apis = upgradeRemoteApis(rawList);
        for (const p of apis) {
          const key = await readSecret(providerKeySS(p.id));
          if (key) p.apiKey = key;
        }
        set({ remoteApis: apis });
        // Persist scrubbed form immediately so plaintext never lingers.
        get().saveRemoteApis();
      } catch {
        set({ remoteApis: [] });
      }
    }

    // HF token: SecureStore first, legacy AsyncStorage migrates once.
    const ssToken = await readSecret(HF_TOKEN_SS_KEY);
    if (ssToken) {
      set({ hfToken: ssToken });
    } else if (legacyTokenRaw) {
      // Isolated: writeSecret now rejects, and letting that rejection reach
      // hydrate's outer catch would abandon every read after this line. A
      // failed migration keeps the legacy value in AsyncStorage to retry
      // next launch.
      try {
        await writeSecret(HF_TOKEN_SS_KEY, legacyTokenRaw);
        await asyncStorage.removeItem(HF_TOKEN_KEY);
        set({ hfToken: legacyTokenRaw });
      } catch {
        // Legacy copy stays put; the token is simply absent this session.
      }
    }
    // Absent means the default (on): only an explicit "false" parks it.
    if (useTokenRaw !== null) {
      set({ useHfToken: useTokenRaw === "true" });
    }

    if (activeRaw) {
      const parsed = JSON.parse(activeRaw);
      set({
        activeModelId: parsed.modelId,
        activeProviderType: parsed.providerType,
      });
    }

    set({ modelSettings: parseModelSettingsMap(settingsRaw) });

    try {
      const guard = guardRaw ? JSON.parse(guardRaw) : 0;
      if (typeof guard === "number" && Number.isFinite(guard) && guard > 0) {
        set({ largestSuccessfulBytes: guard });
      }
    } catch {
      // Ignore corrupt guard value.
    }

    try {
      const capsRawParsed: unknown = capsRaw ? JSON.parse(capsRaw) : null;
      if (capsRawParsed && typeof capsRawParsed === "object") {
        const payload = capsRawParsed as Record<string, unknown>;
        set({
          remoteCaps: upgradeRemoteCaps(payload.caps),
          privacyAcknowledged: payload.privacyAcknowledged === true,
        });
      }
    } catch {
      // Ignore corrupt caps value.
    }

    await get().loadPresets();
  } catch (e) {
    console.warn("Failed to load persisted model state:", e);
  }
}
