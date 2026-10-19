/** Onboarding flag: first-run step flow lives under app/onboarding/.
 *
 * Lazy AsyncStorage import keeps node tests green (chat.ts pattern).
 */

import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@/services/storage/storage";

export const ONBOARDED_KEY = "liai_onboarded";

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export IS the AsyncStorage singleton;
  // the fallback covers bundlers that namespace-import it.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

export async function isOnboarded(): Promise<boolean> {
  try {
    return (await (await rnStorage()).getItem(ONBOARDED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setOnboarded(): Promise<void> {
  try {
    await (await rnStorage()).setItem(ONBOARDED_KEY, "1");
  } catch {
    // Non-critical: the worst case is seeing onboarding once more.
  }
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
