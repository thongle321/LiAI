/** Web-search settings: provider, result count, consent, per-provider keys.
 *
 * Factory takes KV storage + SecureStore adapter so tests inject memory
 * (see chat.ts pattern). Keys never touch KV. The on-device talent
 * consumes this shape (incl. consent gate).
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../services/storage/storage";
import {
  DEFAULT_PROVIDER,
  DEFAULT_RESULT_COUNT,
  isSearchProviderId,
  parseResultCount,
  searchKeySS,
  type SearchProviderId,
} from "../services/search/search-providers.ts";

export const SEARCH_KEY = "liai_search";

export interface SecureAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SearchState {
  activeProviderId: SearchProviderId;
  resultCount: number;
  hasConsented: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setActiveProvider: (id: SearchProviderId) => void;
  setResultCount: (n: number) => void;
  setConsented: (consented: boolean) => void;
  setProviderKey: (id: SearchProviderId, key: string) => Promise<void>;
  getProviderKey: (id: SearchProviderId) => Promise<string | null>;
  clearProviderKey: (id: SearchProviderId) => Promise<void>;
}

function parseSearchSettings(raw: string | null): {
  activeProviderId: SearchProviderId;
  resultCount: number;
  hasConsented: boolean;
} {
  const fallback = {
    activeProviderId: DEFAULT_PROVIDER,
    resultCount: DEFAULT_RESULT_COUNT,
    hasConsented: false,
  };
  if (!raw) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
    const r = v as Record<string, unknown>;
    return {
      activeProviderId: isSearchProviderId(r.activeProviderId)
        ? r.activeProviderId
        : DEFAULT_PROVIDER,
      resultCount: parseResultCount(r.resultCount),
      hasConsented: r.hasConsented === true,
    };
  } catch {
    return fallback;
  }
}

export function createSearchStore(storage: KeyValueStorage, secure: SecureAdapter) {
  /** In-flight `load()`, so concurrent callers share one read. */
  let hydrating: Promise<void> | null = null;

  return create<SearchState>()((set, get) => {
    async function persist(): Promise<void> {
      const { activeProviderId, resultCount, hasConsented } = get();
      try {
        await storage.setItem(
          SEARCH_KEY,
          JSON.stringify({ activeProviderId, resultCount, hasConsented }),
        );
      } catch {
        // Ignore persistence failures; search settings are non-critical.
      }
    }

    async function guardedSecure(fn: () => Promise<void>): Promise<void> {
      try {
        await fn();
      } catch {
        // SecureStore unavailable (e.g. restricted device); keys stay unset.
      }
    }

    return {
      activeProviderId: DEFAULT_PROVIDER,
      resultCount: DEFAULT_RESULT_COUNT,
      hasConsented: false,
      loaded: false,
      load: async () => {
        // Single-flight, like the model store's loadPersisted: the startup
        // gate and the settings screen both call this, and a second read
        // racing the first could overwrite a consent the user just toggled.
        if (get().loaded) return;
        hydrating ??= (async () => {
          set({ ...parseSearchSettings(await storage.getItem(SEARCH_KEY)), loaded: true });
        })().finally(() => {
          hydrating = null;
        });
        await hydrating;
      },
      setActiveProvider: (id) => {
        set({ activeProviderId: id });
        void persist();
      },
      setResultCount: (n) => {
        set({ resultCount: parseResultCount(n) });
        void persist();
      },
      setConsented: (consented) => {
        set({ hasConsented: consented });
        void persist();
      },
      setProviderKey: async (id, key) => {
        await guardedSecure(() => secure.setItem(searchKeySS(id), key));
      },
      getProviderKey: async (id) => {
        try {
          return await secure.getItem(searchKeySS(id));
        } catch {
          return null;
        }
      },
      clearProviderKey: async (id) => {
        await guardedSecure(() => secure.removeItem(searchKeySS(id)));
      },
    };
  });
}

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop shim can surface it under `.default` or on the namespace itself.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

async function secureModule(): Promise<typeof import("expo-secure-store")> {
  return await import("expo-secure-store");
}

/** App singleton: AsyncStorage KV + SecureStore keys. */
export const useSearch = createSearchStore(
  {
    getItem: async (key) => (await rnStorage()).getItem(key),
    setItem: async (key, value) => {
      await (await rnStorage()).setItem(key, value);
    },
    removeItem: async (key) => {
      await (await rnStorage()).removeItem(key);
    },
  },
  {
    getItem: async (key) => (await secureModule()).getItemAsync(key),
    setItem: async (key, value) => {
      await (await secureModule()).setItemAsync(key, value);
    },
    removeItem: async (key) => {
      await (await secureModule()).deleteItemAsync(key);
    },
  },
);
