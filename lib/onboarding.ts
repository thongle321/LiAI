/** Onboarding flag: first-run step flow lives under app/onboarding/.
 *
 * Lazy AsyncStorage import keeps node tests green (chat.ts pattern).
 */

import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";

export const ONBOARDED_KEY = "liai_onboarded_v1";

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
