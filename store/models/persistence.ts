/** Persistence slice: hydrate the store once on app start. */

import type { StateCreator } from "zustand";

import type { ModelStore, PersistenceSlice } from "./types";
import { parseModelSettingsMap } from "../../lib/model-settings";
import { HF_TOKEN_SS_KEY, providerKeySS } from "../../lib/secrets";
import {
  upgradeModelList,
  upgradeRemoteApis,
  upgradeRemoteCaps,
} from "../../lib/model-upgrade";
import {
  ACTIVE_MODEL_KEY,
  HF_TOKEN_KEY,
  MEMORY_GUARD_KEY,
  MODEL_SETTINGS_KEY,
  REMOTE_APIS_KEY,
  REMOTE_CAPS_KEY,
  STORAGE_KEY,
  asyncStorage,
  readSecret,
  writeSecret,
} from "./storage";

export const createPersistenceSlice: StateCreator<
  ModelStore,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  loadPersisted: async () => {
    try {
      const [modelsRaw, apisRaw, legacyTokenRaw, activeRaw, settingsRaw, guardRaw, capsRaw] =
        await Promise.all([
          asyncStorage.getItem(STORAGE_KEY),
          asyncStorage.getItem(REMOTE_APIS_KEY),
          asyncStorage.getItem(HF_TOKEN_KEY),
          asyncStorage.getItem(ACTIVE_MODEL_KEY),
          asyncStorage.getItem(MODEL_SETTINGS_KEY),
          asyncStorage.getItem(MEMORY_GUARD_KEY),
          asyncStorage.getItem(REMOTE_CAPS_KEY),
        ]);

      if (modelsRaw) {
        try {
          const models = upgradeModelList(JSON.parse(modelsRaw));
          // Hydrate remote model keys from SecureStore (never persisted in KV).
          for (const m of models) {
            if (m.origin === "remote_api" && m.id.startsWith("remote-")) {
              const key = await readSecret(providerKeySS(m.id.slice("remote-".length)));
              if (key) m.apiKey = key;
            }
          }
          set({ models });
          // Killed downloads leave partial files: mark them paused so the
          // manual Resume button continues from kept bytes (no auto-start).
          await get().reconcileInterrupted();
        } catch {
          // Corrupt payload: start empty rather than crash.
          set({ models: [] });
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
        await writeSecret(HF_TOKEN_SS_KEY, legacyTokenRaw);
        await asyncStorage.removeItem(HF_TOKEN_KEY);
        set({ hfToken: legacyTokenRaw });
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
  },
});
