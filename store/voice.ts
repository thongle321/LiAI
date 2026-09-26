/** Voice output settings: system voice, rate/pitch, auto-speak. Persisted.
 *
 * Factory takes storage so tests inject memory (see chat.ts pattern).
 * Defaults preserve current behavior: system voice, 1.0x, auto-speak on.
 * Engine interface left open: voiceId selects among expo-speech system
 * voices today; neural engines slot in later without shape changes.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage";

export const VOICE_KEY = "liai_voice_v1";

export const DEFAULT_RATE = 1.0;
export const DEFAULT_PITCH = 1.0;
export const MIN_RATE = 0.5;
export const MAX_RATE = 2.0;
export const MIN_PITCH = 0.5;
export const MAX_PITCH = 2.0;

export interface VoiceState {
  voiceId: string | null;
  rate: number;
  pitch: number;
  autoSpeak: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setVoice: (voiceId: string | null) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setAutoSpeak: (autoSpeak: boolean) => void;
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n)
    ? Math.min(hi, Math.max(lo, n))
    : fallback;
}

function parseVoiceState(raw: string | null): {
  voiceId: string | null;
  rate: number;
  pitch: number;
  autoSpeak: boolean;
} {
  const fallback = {
    voiceId: null as string | null,
    rate: DEFAULT_RATE,
    pitch: DEFAULT_PITCH,
    autoSpeak: true,
  };
  if (!raw) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
    const r = v as Record<string, unknown>;
    return {
      voiceId: typeof r.voiceId === "string" ? r.voiceId : null,
      rate: clamp(r.rate as number, MIN_RATE, MAX_RATE, DEFAULT_RATE),
      pitch: clamp(r.pitch as number, MIN_PITCH, MAX_PITCH, DEFAULT_PITCH),
      autoSpeak: typeof r.autoSpeak === "boolean" ? r.autoSpeak : true,
    };
  } catch {
    return fallback;
  }
}

export function createVoiceStore(storage: KeyValueStorage) {
  return create<VoiceState>()((set, get) => {
    async function persist(): Promise<void> {
      const { voiceId, rate, pitch, autoSpeak } = get();
      try {
        await storage.setItem(
          VOICE_KEY,
          JSON.stringify({ voiceId, rate, pitch, autoSpeak }),
        );
      } catch {
        // Ignore persistence failures; voice settings are non-critical.
      }
    }

    return {
      voiceId: null,
      rate: DEFAULT_RATE,
      pitch: DEFAULT_PITCH,
      autoSpeak: true,
      loaded: false,
      load: async () => {
        set({ ...parseVoiceState(await storage.getItem(VOICE_KEY)), loaded: true });
      },
      setVoice: (voiceId) => {
        set({ voiceId });
        void persist();
      },
      setRate: (rate) => {
        set({ rate: clamp(rate, MIN_RATE, MAX_RATE, DEFAULT_RATE) });
        void persist();
      },
      setPitch: (pitch) => {
        set({ pitch: clamp(pitch, MIN_PITCH, MAX_PITCH, DEFAULT_PITCH) });
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
