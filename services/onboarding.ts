/** Onboarding flag: first-run step flow lives under app/onboarding/.
 *
 * Lazy AsyncStorage import keeps node tests green (chat.ts pattern).
 *
 * The legacy "liai_onboarded" key that older installs used is owned by the
 * onboarding store, which is the only thing that reads it.
 */

import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@/services/storage/storage";

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export IS the AsyncStorage singleton;
  // the fallback covers bundlers that namespace-import it.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

/** Lazy AsyncStorage adapter for the onboarding store (KeyValueStorage shape). */
export const onboardingStorage: KeyValueStorage = {
  getItem: async (key) => {
    try {
      const s = await rnStorage();
      return await s.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      const s = await rnStorage();
      await s.setItem(key, value);
    } catch {
      // best effort
    }
  },
  removeItem: async (key) => {
    try {
      const s = await rnStorage();
      await s.removeItem(key);
    } catch {
      // best effort
    }
  },
};
