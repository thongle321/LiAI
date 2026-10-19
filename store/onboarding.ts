import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { KeyValueStorage } from "@/services/storage/storage";
import { toStateStorage } from "@/services/storage/persist-helpers";
import { isOnboarded, setOnboarded } from "../services/onboarding.ts";

export type OnboardingExit = "/chat" | "/models";
export const ONBOARDING_KEY = "liai_onboarding";
export const LEGACY_ONBOARDED_KEY = "liai_onboarded";
export interface OnboardingFlag { read: () => Promise<boolean>; write: () => Promise<void>; }
export interface OnboardingState {
  onboarded: boolean; hydrated: boolean; exitTo: OnboardingExit | null;
  hydrate: () => Promise<void>; complete: (to: OnboardingExit) => Promise<void>; clearExit: () => void;
}
interface OnboardingStoreApi { persist: { rehydrate: () => void | Promise<void> }; getState: () => OnboardingState; }

async function rnStorage(): Promise<KeyValueStorage | null> {
  try {
    const mod = await import("@react-native-async-storage/async-storage");
    return (mod.default ?? mod) as unknown as KeyValueStorage;
  } catch {
    return null;
  }
}

const asyncStorageAdapter: KeyValueStorage = {
  getItem: async (key) => {
    const s = await rnStorage();
    if (!s) return null;
    try { return await s.getItem(key); } catch { return null; }
  },
  setItem: async (key, value) => {
    const s = await rnStorage();
    if (!s) return;
    try { await s.setItem(key, value); } catch { /* best effort */ }
  },
  removeItem: async (key) => {
    const s = await rnStorage();
    if (!s) return;
    try { await s.removeItem(key); } catch { /* best effort */ }
  },
};

export function createOnboardingStore(storage: KeyValueStorage) {
  const ctx = { getState: null as null | (() => OnboardingState), writesEnabled: false };

  const gated = {
    getItem: (key: string) => storage.getItem(key),
    setItem: async (key: string, value: string) => {
      if (!ctx.writesEnabled) return;
      if (ctx.getState && !ctx.getState().hydrated) return;
      try { await storage.setItem(key, value); } catch { /* best effort */ }
    },
    removeItem: (key: string) => storage.removeItem(key),
  };

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
                  await storage.setItem(ONBOARDING_KEY, JSON.stringify({ state: { onboarded: true }, version: 0 }));
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
          set({ onboarded: true, hydrated: true, exitTo: to });
          ctx.writesEnabled = true;
          try { await storage.setItem(ONBOARDING_KEY, JSON.stringify({ state: { onboarded: true }, version: 0 })); } catch {}
        },
        clearExit: () => set({ exitTo: null }),
      }),
      {
        name: ONBOARDING_KEY,
        storage: createJSONStorage(() => toStateStorage(gated as KeyValueStorage)),
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

export const useOnboardingStore = createOnboardingStore(asyncStorageAdapter);
