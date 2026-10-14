/** Vision watch-mode capture interval — a USER setting.
 *
 * Moved out of store/voice.ts during the v2 voice clean break: it was never
 * a voice setting, it was squatting in the voice blob. Starts at the default
 * (the old value was discarded with the rest of `liai_voice_v1`) and
 * persists from here on under its own key.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage.ts";
import { clampWatchInterval, WATCH_INTERVAL_DEFAULT_MS } from "../lib/vision-watch.ts";

export const WATCH_KEY = "liai_watch_v1";

export interface WatchState {
  watchIntervalMs: number;
  loaded: boolean;
  load: () => Promise<void>;
  setWatchIntervalMs: (ms: number) => void;
}

export function createWatchStore(storage: KeyValueStorage) {
  return create<WatchState>()((set, get) => {
    async function persist(): Promise<void> {
      try {
        await storage.setItem(WATCH_KEY, JSON.stringify({ watchIntervalMs: get().watchIntervalMs }));
      } catch {
        // Ignore persistence failures; this preference is non-critical.
      }
    }

    return {
      watchIntervalMs: WATCH_INTERVAL_DEFAULT_MS,
      loaded: false,
      load: async () => {
        let parsed = WATCH_INTERVAL_DEFAULT_MS;
        try {
          const raw = await storage.getItem(WATCH_KEY);
          if (raw) {
            const v: unknown = JSON.parse(raw);
            if (v && typeof v === "object" && !Array.isArray(v)) {
              parsed = clampWatchInterval((v as Record<string, unknown>).watchIntervalMs as number);
            }
          }
        } catch {
          // Corrupt blob: keep the default rather than blocking the screen.
        }
        set({ watchIntervalMs: parsed, loaded: true });
      },
      setWatchIntervalMs: (ms) => {
        set({ watchIntervalMs: clampWatchInterval(ms) });
        void persist();
      },
    };
  });
}

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop wrapper returns the namespace on some bundlers.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

/** App singleton backed by on-device AsyncStorage. */
export const useWatch = createWatchStore({
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
});