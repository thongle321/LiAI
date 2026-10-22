/** Web-search settings: provider, result count, consent, per-provider keys.
 *
 * Persisted with Zustand's `persist` middleware over AsyncStorage; KV holds
 * prefs, SecureStore holds keys (never KV). `skipHydration` keeps cold-start
 * discipline. No version/migrate: breaking changes bump SEARCH_KEY.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@/services/storage/storage";
import { dedupedStorage, toStateStorage } from "@/services/storage/persist-helpers";
import { resetSearchCache } from "@/services/agent/search-budget.ts";
import {
  DEFAULT_PROVIDER,
  DEFAULT_RESULT_COUNT,
  isProviderSelectable,
  parseResultCount,
  searchKeySS,
} from "@/services/search/search-providers.ts";
import type { SearchProviderId } from "@/types/api.ts";

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

interface SearchStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => SearchState;
  setState: (partial: Partial<SearchState>) => void;
}

function normalizeSearchSettings(raw: unknown): {
  activeProviderId: SearchProviderId;
  resultCount: number;
  hasConsented: boolean;
} {
  const fallback = {
    activeProviderId: DEFAULT_PROVIDER,
    resultCount: DEFAULT_RESULT_COUNT,
    hasConsented: false,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const r = raw as Record<string, unknown>;
  return {
    activeProviderId: isProviderSelectable(r.activeProviderId)
      ? r.activeProviderId
      : DEFAULT_PROVIDER,
    resultCount: parseResultCount(r.resultCount),
    hasConsented: r.hasConsented === true,
  };
}

function parseSearchSettings(raw: string | null): ReturnType<typeof normalizeSearchSettings> {
  const fallback = {
    activeProviderId: DEFAULT_PROVIDER,
    resultCount: DEFAULT_RESULT_COUNT,
    hasConsented: false,
  };
  if (!raw) return fallback;
  try {
    return normalizeSearchSettings(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function createSearchStore(storage: KeyValueStorage, secure: SecureAdapter) {
  let hydrating: Promise<void> | null = null;
  let api: SearchStoreApi | null = null;

  const created = create<SearchState>()(
    persist(
      (set, get) => {
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
            if (get().loaded) return;
            hydrating ??= (async () => {
              if (!api) return;
              try {
                await api.persist.rehydrate();
              } catch {
                // Corrupt/unreadable blob: keep defaults rather than
                // rejecting the load (matches prior parseSearchSettings).
              }
              set({ loaded: true });
            })().finally(() => {
              hydrating = null;
            });
            await hydrating;
          },
          setActiveProvider: (id) => {
            // PocketParity store guard: a gated provider appears in the
            // picker but can never become the active one.
            if (!isProviderSelectable(id)) return;
            // A provider switch invalidates the hit cache: the new
            // provider's hits must never replay the old provider's rows.
            resetSearchCache();
            set({ activeProviderId: id });
          },
          setResultCount: (n) => {
            set({ resultCount: parseResultCount(n) });
          },
          setConsented: (consented) => {
            // PocketParity: consent on/off clears the hit cache; consent
            // is a privacy gate, and hits fetched under it must not
            // outlive the grant.
            resetSearchCache();
            set({ hasConsented: consented });
          },
          setProviderKey: async (id, key) => {
            await guardedSecure(() => secure.setItem(searchKeySS(id), key));
            // PocketParity: the key is deliberately NOT part of the cache
            // key, so a key change invalidates explicitly.
            resetSearchCache();
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
            resetSearchCache();
          },
        };
      },
      {
        name: SEARCH_KEY,
        // Deduped: publishing `loaded` writes the same bytes the middleware
        // just wrote, and the middleware writes on every state change.
        storage: createJSONStorage(() => toStateStorage(dedupedStorage(storage))),
        skipHydration: true,
        partialize: (state) => ({
          activeProviderId: state.activeProviderId,
          resultCount: state.resultCount,
          hasConsented: state.hasConsented,
        }),
        merge: (persistedState, currentState) => {
          const validated = normalizeSearchSettings(persistedState);
          return {
            ...currentState,
            ...validated,
            loaded: currentState.loaded,
          };
        },
        onRehydrateStorage: () => (state) => {
          // Published through the store so subscribers re-render; an in-place
          // mutation would leave them on a stale `loaded`.
          if (state) api?.setState({ loaded: true });
        },
      },
    ),
  );

  api = created as unknown as SearchStoreApi;
  return created;
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