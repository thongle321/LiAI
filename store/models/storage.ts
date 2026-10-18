/** Persistence plumbing for the model store.
 *
 * AsyncStorage for metadata, SecureStore for user-provided secrets
 * (provider apiKeys, HF token) — never the other way around.
 */

import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@/services/storage/storage";

export const STORAGE_KEY = "liai_models";
export const ACTIVE_MODEL_KEY = "liai_active_model";
export const REMOTE_APIS_KEY = "liai_remote_apis";
export const HF_TOKEN_KEY = "liai_hf_token_v1"; // legacy ON-DISK name, read once to migrate the secret to SecureStore — the string must match what already shipped, so it keeps its suffix
export const HF_TOKEN_USE_KEY = "liai_hf_token_use"; // attach the token to requests, or park it
export const MODEL_SETTINGS_KEY = "liai_model_settings";
export const HF_SEARCH_FILTERS_KEY = "liai_hf_search_filters"; // author + sort, per the HF search sheet
export const MEMORY_GUARD_KEY = "liai_memory_guard";
export const REMOTE_CAPS_KEY = "liai_remote_caps";

async function secureStore(): Promise<typeof import("expo-secure-store")> {
  return await import("expo-secure-store");
}

/**
 * The three secret operations, built over an injected loader.
 *
 * The loader is a parameter for the same reason
 * `services/chat/keep-awake.ts`'s is: SecureStore is reached by a DYNAMIC
 * import, which Jest's CommonJS runtime cannot resolve, so without a seam
 * nothing could cover the one contract that matters here — a refused write
 * must REACH the caller. Production passes the real loader.
 */
export function createSecrets(load: typeof secureStore) {
  /** Read a secret; null when missing or SecureStore unavailable. A read is
   *  forgiving on purpose: "no token" and "cannot tell" both mean the app
   *  continues unauthenticated, and nothing the user typed is at stake. */
  async function readSecret(key: string): Promise<string | null> {
    try {
      return await (await load()).getItemAsync(key);
    } catch (e) {
      console.warn(`Failed to read secret ${key}:`, e);
      return null;
    }
  }

  /** Write a secret; REJECTS when SecureStore refuses.
   *
   *  The failure has to reach the caller: `setHfToken` persists before it
   *  flips the store, and `components/settings/hf-token-settings.tsx` keys its
   *  inline "Error saving token" state off that rejection. A silent warn here
   *  would report success for a token that is not on disk. */
  async function writeSecret(key: string, value: string): Promise<void> {
    try {
      await (await load()).setItemAsync(key, value);
    } catch (e) {
      console.warn(`Failed to write secret ${key}:`, e);
      throw e;
    }
  }

  /** Delete a secret; REJECTS when SecureStore refuses, for the same reason
   *  `writeSecret` does — a token the UI says is gone but isn't is the same
   *  lie as one it says is saved but isn't. */
  async function deleteSecret(key: string): Promise<void> {
    try {
      await (await load()).deleteItemAsync(key);
    } catch (e) {
      console.warn(`Failed to delete secret ${key}:`, e);
      throw e;
    }
  }

  return { readSecret, writeSecret, deleteSecret };
}

/** The app's secret access: the real module, loaded on first use. */
const secrets = createSecrets(secureStore);

export const readSecret = secrets.readSecret;
export const writeSecret = secrets.writeSecret;
export const deleteSecret = secrets.deleteSecret;

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop shim can surface it under `.default` or on the namespace itself.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

export const asyncStorage: KeyValueStorage = {
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
