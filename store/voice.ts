/** Voice output settings: chosen device voice and auto-speak. Persisted.
 *
 * v2 kept the key across the engine era's trim, so the shape is now
 * `{ voiceId, autoSpeak }`: a neural-engine `currentVoice` migrates back
 * to `voiceId` because the only engine that ever had an implementation
 * was System, and `null` already means "the System default".
 *
 * The factory takes storage so tests inject memory (see chat.ts pattern).
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage.ts";

export const VOICE_KEY = "liai_voice_v2";

export interface VoiceState {
  /** null = the System default voice. */
  voiceId: string | null;
  autoSpeak: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setVoice: (voiceId: string | null) => void;
  setAutoSpeak: (autoSpeak: boolean) => void;
}

/** The persisted slice — everything in the blob except `loaded`. */
type PersistedVoiceState = Pick<VoiceState, "voiceId" | "autoSpeak">;

/**
 * The engine era stored `{ currentVoice: { id, name, engine }, ... }`.
 * Only `engine === "system"` maps onto a voice the OS can speak, so any
 * other engine falls back to the System default rather than being pinned
 * to an id nothing can use.
 */
function migrateCurrentVoice(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as { id?: unknown; engine?: unknown };
  if (v.engine !== "system") return null;
  return typeof v.id === "string" ? v.id : null;
}

function parseStoredVoiceId(r: Record<string, unknown>): string | null {
  if (typeof r.voiceId === "string") return r.voiceId;
  // Engine-era blob: no voiceId, but a currentVoice to migrate from.
  return "currentVoice" in r ? migrateCurrentVoice(r.currentVoice) : null;
}

function parseVoiceState(raw: string | null): PersistedVoiceState {
  const fallback = { voiceId: null as string | null, autoSpeak: true };
  if (!raw) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
    const r = v as Record<string, unknown>;
    return {
      voiceId: parseStoredVoiceId(r),
      autoSpeak: typeof r.autoSpeak === "boolean" ? r.autoSpeak : true,
    };
  } catch {
    return fallback;
  }
}

export function createVoiceStore(storage: KeyValueStorage) {
  return create<VoiceState>()((set, get) => {
    async function persist(): Promise<void> {
      const { voiceId, autoSpeak } = get();
      try {
        await storage.setItem(VOICE_KEY, JSON.stringify({ voiceId, autoSpeak }));
      } catch {
        // Ignore persistence failures; voice settings are non-critical.
      }
    }

    return {
      voiceId: null,
      autoSpeak: true,
      loaded: false,
      load: async () => {
        set({ ...parseVoiceState(await storage.getItem(VOICE_KEY)), loaded: true });
      },
      setVoice: (voiceId) => {
        set({ voiceId });
        void persist();
      },
      setAutoSpeak: (autoSpeak) => {
        set({ autoSpeak });
        void persist();
      },
    };
  });
}

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop wrapper returns the namespace on some bundlers.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

/** App singleton backed by on-device AsyncStorage. */
export const useVoice = createVoiceStore({
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
});