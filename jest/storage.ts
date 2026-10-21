/** In-memory `KeyValueStorage` / `SecureAdapter` fakes for store tests.
 *
 * The preference stores (inference params, search settings, voice settings)
 * all take their persistence by injection, so a plain object stands in for
 * AsyncStorage / SecureStore. The old per-suite copies of this were
 * byte-identical; one typed fake keeps them from drifting.
 */

import type { KeyValueStorage } from "../services/storage/storage.ts";

export type MemoryStorage = KeyValueStorage & {
  /** The live contents, for asserting what was persisted. */
  data: Record<string, string>;
  /** Every `getItem` key, in order, for asserting a read happened once. */
  reads: string[];
  /** Every `setItem` key, in order, for asserting a write did or did not
   *  happen (a store that rewrites its whole state on every keystroke
   *  passes every value assertion and still wears the disk down). */
  writes: string[];
};

function backing(seed: Record<string, string> = {}): MemoryStorage {
  const data: Record<string, string> = { ...seed };
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    data,
    reads,
    writes,
    getItem: async (key: string) => {
      reads.push(key);
      return data[key] ?? null;
    },
    setItem: async (key: string, value: string) => {
      writes.push(key);
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
