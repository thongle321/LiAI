/** Companions store: installed companions, CRUD, once-only builtin seeding.
 *
 * The mirror of PocketPal's PalStore on LiAI's stack: companions live in the
 * local TinyBase `companions` table (through the CompanionRepository port), this
 * store holds the in-memory list the UI renders, and `load()` is the
 * single hydrate + seed entry point. Pip is seeded ONCE behind a flag
 * key — after the first launch records it, deletions and renames
 * survive (PocketPal's PIP_SEEDED_KEY semantics).
 *
 * Factory + singleton, like the inference/voice/search stores: tests
 * inject the repo and a storage fake; production lazily resolves the
 * device repo (expo-sqlite must stay out of plain-Node tests).
 */

import { create } from "zustand";

import type { KeyValueStorage } from "@/services/storage/storage.ts";
import type { Companion, CompanionUpdate } from "@/types/companion.ts";
import type { CompanionRepository } from "@/services/companions/repository.ts";
import { PIP_COMPANION } from "@/services/companions/builtins.ts";
import { parseCompanionsJson } from "@/services/companions/companion-json.ts";

export const COMPANIONS_PIP_SEEDED_KEY = "liai_companions_pip_seeded";

export interface CompanionsState {
  companions: Companion[];
  loaded: boolean;
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

export function createCompanionsStore(
  getRepo: () => Promise<CompanionRepository | null>,
  storage: KeyValueStorage,
) {
  return create<CompanionsState>()((set, get) => ({
    companions: [],
    loaded: false,

    load: async () => {
      const repo = await getRepo().catch(() => null);
      if (!repo) {
        // Hydration ATTEMPT finished — `loaded` means "no spinner", not
        // "storage worked". Screens surface the empty grid themselves.
        set({ loaded: true });
        return false;
      }
      try {
        let companions = await repo.list();
        // Seed Pip once. After the flag is recorded, a deleted or
        // renamed Pip stays deleted/renamed — the flag is the whole
        // "seeded once" contract.
        const seeded = await storage.getItem(COMPANIONS_PIP_SEEDED_KEY).catch(() => null);
        if (seeded !== "true") {
          const existing = companions.find((p) => p.name === "Pip");
          if (existing) {
            await storage.setItem(COMPANIONS_PIP_SEEDED_KEY, "true").catch(() => {});
          } else {
            const created = await repo.create(PIP_COMPANION).catch(() => null);
            if (created) companions = [...companions, created];
            await storage.setItem(COMPANIONS_PIP_SEEDED_KEY, "true").catch(() => {});
          }
        }
        set({ companions, loaded: true });
        return true;
      } catch {
        // Storage failed: the grid shows what it has (nothing) and the
        // screens surface their own error state.
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
        // No quiet(): a failed create would leave an import that looks
        // complete but dropped companions, so the partial count stays honest.
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
  }));
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
