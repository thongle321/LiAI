import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { KeyValueStorage } from "@/services/storage/storage";
import { toStateStorage, gatedStorage } from "@/services/storage/persist-helpers";
import { onboardingStorage, ONBOARDING_KEY, LEGACY_ONBOARDED_KEY } from "@/services/onboarding.ts";

export type OnboardingExit = "/chat" | "/models";

/** The consolidated shape a first-time legacy install is carried into, so the
 *  middleware's rehydrate picks it up. One writer, one shape. */
const SEEDED_ONBOARDING_BLOB = JSON.stringify({
  state: { onboarded: true },
  version: 0,
});

export interface OnboardingState {
  onboarded: boolean; hydrated: boolean; exitTo: OnboardingExit | null;
  hydrate: () => Promise<void>; complete: (to: OnboardingExit) => Promise<void>; clearExit: () => void;
}
interface OnboardingStoreApi { persist: { rehydrate: () => void | Promise<void> }; getState: () => OnboardingState; }

export function createOnboardingStore(storage: KeyValueStorage) {
  const ctx = { getState: null as null | (() => OnboardingState), writesEnabled: false };

  /** The onboarding flag is best effort: a failed write must not break the
   *  flow, and nothing may be written before the store has hydrated. */
  const bestEffort: KeyValueStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: async (key, value) => {
      try { await storage.setItem(key, value); } catch { /* best effort */ }
    },
    removeItem: (key) => storage.removeItem(key),
  };

  const gated = gatedStorage(
    bestEffort,
    () => ctx.writesEnabled && !!ctx.getState?.().hydrated,
  );

  let api: OnboardingStoreApi | null = null;
  let hydrating: Promise<void> | null = null;

  const created = create<OnboardingState>()(
    persist(
      (set, get) => ({
        onboarded: true, hydrated: false, exitTo: null,
        hydrate: () => {
          if (get().hydrated) return Promise.resolve();
          hydrating ??= (async () => {
            try {
              let hadPersisted = (await storage.getItem(ONBOARDING_KEY)) !== null;
              if (!hadPersisted) {
                const legacy = await storage.getItem(LEGACY_ONBOARDED_KEY).catch(() => null);
                if (legacy === "1") {
                  await storage.setItem(ONBOARDING_KEY, SEEDED_ONBOARDING_BLOB);
                  hadPersisted = true;
                }
              }
              if (api) await api.persist.rehydrate();
              if (!hadPersisted && !get().hydrated) {
                set({ onboarded: false });
              }
            } catch {
              // keep optimistic default on unexpected errors
            } finally {
              ctx.writesEnabled = true;
              set({ hydrated: true });
            }
          })().finally(() => { hydrating = null; });
          return hydrating;
        },
        complete: async (to) => {
          // Enable writes before the set(), so the middleware's own write
          // lands (the gate blocks writes while `writesEnabled` is false).
          ctx.writesEnabled = true;
          set({ onboarded: true, hydrated: true, exitTo: to });
        },
        clearExit: () => set({ exitTo: null }),
      }),
      {
        name: ONBOARDING_KEY,
        storage: createJSONStorage(() => toStateStorage(gated)),
        skipHydration: true,
        partialize: (state: OnboardingState) => ({ onboarded: state.onboarded }),
        merge: (persistedState, currentState) => {
          const r = persistedState && typeof persistedState === "object" && !Array.isArray(persistedState)
            ? (persistedState as Record<string, unknown>) : {};
          if (currentState.hydrated) return { ...currentState, exitTo: currentState.exitTo };
          return {
            ...currentState,
            onboarded: typeof r.onboarded === "boolean" ? r.onboarded : currentState.onboarded,
            hydrated: currentState.hydrated,
          };
        },
      },
    ),
  );

  ctx.getState = created.getState.bind(created);
  api = created as unknown as OnboardingStoreApi;
  return created;
}

export const useOnboardingStore = createOnboardingStore(onboardingStorage);
