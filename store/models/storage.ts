/** Persistence plumbing for the model store.
 *
 * AsyncStorage for metadata, SecureStore for user-provided secrets
 * (provider apiKeys, HF token) — never the other way around.
 */

import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../../services/storage/storage";

export const STORAGE_KEY = "liai_models_v1";
export const ACTIVE_MODEL_KEY = "liai_active_model_v1";
export const REMOTE_APIS_KEY = "liai_remote_apis_v1";
export const HF_TOKEN_KEY = "liai_hf_token_v1"; // legacy AsyncStorage location (migrated to SecureStore)
export const HF_TOKEN_USE_KEY = "liai_hf_token_use_v1"; // attach the token to requests, or park it
export const MODEL_SETTINGS_KEY = "liai_model_settings_v1";
export const HF_SEARCH_FILTERS_KEY = "liai_hf_search_filters_v1"; // author + sort, per the HF search sheet
export const MEMORY_GUARD_KEY = "liai_memory_guard_v1";
export const REMOTE_CAPS_KEY = "liai_remote_caps_v1";

async function secureStore(): Promise<typeof import("expo-secure-store")> {
  return await import("expo-secure-store");
}

/** Read a secret; null when missing or SecureStore unavailable. */
export async function readSecret(key: string): Promise<string | null> {
  try {
    return await (await secureStore()).getItemAsync(key);
  } catch (e) {
    console.warn(`Failed to read secret ${key}:`, e);
    return null;
  }
}

/** Write a secret; warns when SecureStore unavailable. */
export async function writeSecret(key: string, value: string): Promise<void> {
  try {
    await (await secureStore()).setItemAsync(key, value);
  } catch (e) {
    console.warn(`Failed to write secret ${key}:`, e);
  }
}

/** Delete a secret; warns when SecureStore unavailable. */
export async function deleteSecret(key: string): Promise<void> {
  try {
    await (await secureStore()).deleteItemAsync(key);
  } catch (e) {
    console.warn(`Failed to delete secret ${key}:`, e);
  }
}

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
