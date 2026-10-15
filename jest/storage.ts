/** In-memory `KeyValueStorage` / `SecureAdapter` fakes for store tests.
 *
 * The preference stores (inference params, search settings, voice settings)
 * all take their persistence by injection, so a plain object stands in for
 * AsyncStorage / SecureStore. The old per-suite copies of this were
 * byte-identical; one typed fake keeps them from drifting.
 */

import type { KeyValueStorage } from "../lib/storage.ts";

export type MemoryStorage = KeyValueStorage & {
  /** The live contents, for asserting what was persisted. */
  data: Record<string, string>;
};

function backing(seed: Record<string, string> = {}): MemoryStorage {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: async (key: string) => data[key] ?? null,
    setItem: async (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: async (key: string) => {
      delete data[key];
    },
  };
}

/** AsyncStorage stand-in (preference stores, non-secret keys). */
export function memoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  return backing(seed);
}

/** SecureStore stand-in (user-provided provider keys only). */
export function memorySecure(seed: Record<string, string> = {}): MemoryStorage {
  return backing(seed);
}
