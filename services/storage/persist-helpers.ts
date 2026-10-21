/** Small adapters shared by every Zustand store that uses `persist` over a
 *  `KeyValueStorage`. Kept here (not in store/) so the store files stay
 *  focused on state. Pure: no device imports.
 */

import type { StateStorage } from "zustand/middleware";

import type { KeyValueStorage } from "@/services/storage/storage.ts";

export function toStateStorage(storage: KeyValueStorage): StateStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

/** Storage whose `setItem` is a no-op until `isEnabled()` returns true.
 *  Used to keep the D3-4 style hydration guard: the middleware must not
 *  persist anything before the store has loaded. */
export function gatedStorage(
  storage: KeyValueStorage,
  isEnabled: () => boolean,
): KeyValueStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) =>
      isEnabled() ? storage.setItem(key, value) : Promise.resolve(),
    removeItem: (key) => storage.removeItem(key),
  };
}

/** Storage that skips a write whose bytes are identical to the last one
 *  written for that key.
 *
 *  Zustand's `persist` writes on EVERY `set()`, even when the persisted
 *  slice did not change: a download progress tick or a search keystroke
 *  re-serialized the whole catalog to AsyncStorage. Comparing the bytes
 *  makes those writes no-ops.
 *
 *  Put it INSIDE the gate: a write the gate blocked never reached the
 *  disk, so it must not count as "already written". */
export function dedupedStorage(storage: KeyValueStorage): KeyValueStorage {
  const lastWritten = new Map<string, string>();
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      if (lastWritten.get(key) === value) return Promise.resolve();
      return storage.setItem(key, value).then((result) => {
        lastWritten.set(key, value);
        return result;
      });
    },
    removeItem: (key) => {
      lastWritten.delete(key);
      return storage.removeItem(key);
    },
  };
}
