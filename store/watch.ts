/** Vision watch-mode capture interval — a USER setting.
 *
 * Persisted with Zustand's `persist` middleware over AsyncStorage.
 * `skipHydration` keeps cold-start discipline (manual `rehydrate()`); the
 * interval is non-critical, so a stale/missing blob just falls back to the
 * default. No version/migrate: breaking changes bump WATCH_KEY.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@/services/storage/storage.ts";
import { dedupedStorage, toStateStorage } from "@/services/storage/persist-helpers";
import { clampWatchInterval, WATCH_INTERVAL_DEFAULT_MS } from "@/services/vision/vision-watch.ts";

export const WATCH_KEY = "liai_watch";

export interface WatchState {
  watchIntervalMs: number;
  loaded: boolean;
  load: () => Promise<void>;
  setWatchIntervalMs: (ms: number) => void;
}

interface WatchStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => WatchState;
  setState: (partial: Partial<WatchState>) => void;
}

export function createWatchStore(storage: KeyValueStorage) {
  let api: WatchStoreApi | null = null;

  const created = create<WatchState>()(
    persist(
      (set, get) => ({
        watchIntervalMs: WATCH_INTERVAL_DEFAULT_MS,
        loaded: false,
        load: async () => {
          if (get().loaded) return;
          if (!api) return;
          await api.persist.rehydrate();
        },
        setWatchIntervalMs: (ms) => {
          set({ watchIntervalMs: clampWatchInterval(ms) });
        },
      }),
      {
        name: WATCH_KEY,
        // Deduped: publishing `loaded` writes the same bytes the middleware
        // just wrote, and the middleware writes on every state change.
        storage: createJSONStorage(() => toStateStorage(dedupedStorage(storage))),
        skipHydration: true,
        partialize: (state) => ({ watchIntervalMs: state.watchIntervalMs }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as { watchIntervalMs?: unknown } | null;
          const clamped =
            typeof persisted?.watchIntervalMs === "number"
              ? clampWatchInterval(persisted.watchIntervalMs)
              : currentState.watchIntervalMs;
          return { ...currentState, watchIntervalMs: clamped, loaded: currentState.loaded };
        },
        onRehydrateStorage: () => (state) => {
          // Published through the store so subscribers re-render; an in-place
          // mutation would leave them on a stale `loaded`.
          if (state) api?.setState({ loaded: true });
        },
      },
    ),
  );

  api = created as unknown as WatchStoreApi;
  return created;
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