/** Companions store: installed companions, CRUD, once-only builtin seeding.
 *
 * Persisted with Zustand's `persist` middleware over AsyncStorage: only the
 * "Pip seeded" flag survives (companions live in TinyBase). `skipHydration`
 * keeps cold-start discipline (manual `rehydrate()`). No version/migrate:
 * breaking changes bump COMPANIONS_PIP_SEEDED_KEY.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { KeyValueStorage } from "@/services/storage/storage.ts";
import { toStateStorage } from "@/services/storage/persist-helpers";
import type { Companion, CompanionUpdate } from "@/types/companion.ts";
import type { CompanionRepository } from "@/services/companions/repository.ts";
import { PIP_COMPANION } from "@/services/companions/builtins.ts";
import { parseCompanionsJson } from "@/services/companions/companion-json.ts";

export const COMPANIONS_PIP_SEEDED_KEY = "liai_companions_pip_seeded";

export interface CompanionsState {
  companions: Companion[];
  loaded: boolean;
  /** Whether Pip has already been seeded (once-only). */
  pipSeeded: boolean;
  /** Hydrate from storage and seed Pip once. Safe to call repeatedly
   *  (the flag makes seeding idempotent); resolves false when storage
   *  is unavailable. */
  load: () => Promise<boolean>;
  createCompanion: (
    data: Omit<Companion, "id" | "created_at" | "updated_at">,
  ) => Promise<Companion | null>;
  /** Merge-patch; null erases greeting/defaultModel. Null back on a
   *  failed write (the caller's UI keeps the old value). */
  updateCompanion: (id: string, patch: CompanionUpdate) => Promise<Companion | null>;
  deleteCompanion: (id: string) => Promise<boolean>;
  /** Pull companions back from an exported JSON file. Validated BEFORE
   *  anything is written; ids are minted fresh, never read from the
   *  file, so importing the same backup twice yields two copies. */
  importCompanions: (
    raw: string,
  ) => Promise<{ imported: number; skipped: number; error?: string }>;
  /** Sync lookup for render paths (greeting bubble, picker header). */
  getCompanion: (id: string | null | undefined) => Companion | undefined;
}

interface CompanionsStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => CompanionsState;
}

export function createCompanionsStore(
  getRepo: () => Promise<CompanionRepository | null>,
  storage: KeyValueStorage,
) {
  let api: CompanionsStoreApi | null = null;

  const created = create<CompanionsState>()(
    persist(
      (set, get) => ({
        companions: [],
        loaded: false,
        pipSeeded: false,

        load: async () => {
          const repo = await getRepo().catch(() => null);
          if (!repo) {
            set({ loaded: true });
            return false;
          }
          try {
            if (api) await api.persist.rehydrate();
            let companions = await repo.list();
            if (!get().pipSeeded) {
              const existing = companions.find((p) => p.name === "Pip");
              if (existing) {
                set({ pipSeeded: true });
              } else {
                const createdCompanion = await repo.create(PIP_COMPANION).catch(() => null);
                if (createdCompanion) companions = [...companions, createdCompanion];
                set({ pipSeeded: true });
              }
            }
            set({ companions, loaded: true });
            return true;
          } catch {
            set({ loaded: true });
            return false;
          }
        },

        createCompanion: async (data) => {
          const repo = await getRepo().catch(() => null);
          if (!repo) return null;
          try {
            const companion = await repo.create(data);
            set((s) => ({ companions: [...s.companions, companion] }));
            return companion;
          } catch {
            return null;
          }
        },

        updateCompanion: async (id, patch) => {
          const repo = await getRepo().catch(() => null);
          if (!repo) return null;
          try {
            const companion = await repo.update(id, patch);
            set((s) => ({ companions: s.companions.map((p) => (p.id === id ? companion : p)) }));
            return companion;
          } catch {
            return null;
          }
        },

        deleteCompanion: async (id) => {
          const repo = await getRepo().catch(() => null);
          if (!repo) return false;
          try {
            const ok = await repo.remove(id);
            if (ok) set((s) => ({ companions: s.companions.filter((p) => p.id !== id) }));
            return ok;
          } catch {
            return false;
          }
        },

        importCompanions: async (raw) => {
          const parsed = parseCompanionsJson(raw);
          if ("error" in parsed) return { imported: 0, skipped: 0, error: parsed.error };
          const repo = await getRepo().catch(() => null);
          if (!repo) {
            return { imported: 0, skipped: 0, error: "Storage isn't ready." };
          }
          let imported = 0;
          let skipped = parsed.skipped;
          const added: Companion[] = [];
          for (const seed of parsed.companions) {
            try {
              added.push(await repo.create(seed));
              imported += 1;
            } catch {
              skipped += 1;
            }
          }
          if (added.length > 0) set((s) => ({ companions: [...s.companions, ...added] }));
          return { imported, skipped };
        },

        getCompanion: (id) =>
          id === null || id === undefined ? undefined : get().companions.find((p) => p.id === id),
      }),
      {
        name: COMPANIONS_PIP_SEEDED_KEY,
        storage: createJSONStorage(() => toStateStorage(storage)),
        skipHydration: true,
        partialize: (state) => ({ pipSeeded: state.pipSeeded }),
      },
    ),
  );

  api = created as unknown as CompanionsStoreApi;
  return created;
}

/** Default repo: the device TinyBase store, lazily imported so
 *  expo-sqlite never loads in plain-Node tests. */
async function defaultGetRepo(): Promise<CompanionRepository | null> {
  try {
    const { getCompanionRepository } = await import("@/services/chat/tinybase.ts");
    return await getCompanionRepository();
  } catch {
    return null;
  }
}

/** Lazy AsyncStorage adapter — same shape as every other prefs store. */
async function defaultStorage(): Promise<KeyValueStorage> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop shim can surface it under `.default` or on the namespace
  // itself (same as store/voice.ts and store/inference.ts).
  return (mod.default ?? mod) as unknown as KeyValueStorage;
}

/** Hydration for the singleton, kicked off once by the chat screen
 *  (the same place PocketPal awaits palStore.ready). Exported so a
 *  screen can await it without re-running it. */
let hydrating: Promise<boolean> | null = null;

export const useCompanions = createCompanionsStore(defaultGetRepo, {
  getItem: (key) => defaultStorage().then((s) => s.getItem(key)),
  setItem: (key, value) => defaultStorage().then((s) => s.setItem(key, value)),
  removeItem: (key) => defaultStorage().then((s) => s.removeItem(key)),
});

/** Idempotent: the first caller starts hydration, everyone awaits it. */
export function ensureCompanionsLoaded(): Promise<boolean> {
  return (hydrating ??= useCompanions.getState().load());
}