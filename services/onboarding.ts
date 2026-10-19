/** Onboarding flag: first-run step flow lives under app/onboarding/.
 *
 * Lazy AsyncStorage import keeps node tests green (chat.ts pattern).
 *
 * The storage keys live here, next to the adapter that writes them: one
 * owner per key, so the store and the service cannot drift apart.
 */

import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@/services/storage/storage";

/** The key the onboarding flag is persisted under. */
export const ONBOARDING_KEY = "liai_onboarding";

/** The key older installs used. Read once, carried into `ONBOARDING_KEY`,
 * then left alone. */
export const LEGACY_ONBOARDED_KEY = "liai_onboarded";

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
