/** Voice output settings: selected voice, auto-speak, Supertonic options. Persisted.
 *
 * v2 is a clean break from `liai_voice_v1`: rate, pitch, voiceId and the
 * unrelated vision `watchIntervalMs` are gone (watchIntervalMs moved to
 * store/watch.ts). Old blobs are discarded, so every existing user lands on
 * the System default voice — which is the intended behaviour, since System
 * is the fixed voice and `currentVoice: null` means exactly that.
 *
 * The store stays free of native imports so tests run in plain node; the
 * engine-release side effect on auto-speak is injected via `onAutoSpeak`.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage.ts";
import {
  DEFAULT_SUPERTONIC_LANGUAGE,
  DEFAULT_SUPERTONIC_STEPS,
  SUPERTONIC_STEP_CHOICES,
} from "../lib/tts/constants.ts";
import type { SupertonicSteps, Voice } from "../lib/tts/types.ts";

export const VOICE_KEY = "liai_voice_v2";

export interface VoiceState {
  /** null = the System default voice (the fixed English device voice). */
  currentVoice: Voice | null;
  autoSpeak: boolean;
  /** Supertonic only — ignored by every other engine. */
  supertonicSteps: SupertonicSteps;
  /** Supertonic only — ignored by every other engine. */
  supertonicLanguage: string;
  /** Tri-state escape hatch for the device RAM gate: null = not set. */
  userTTSOverride: boolean | null;
  loaded: boolean;
  load: () => Promise<void>;
  setVoice: (voice: Voice | null) => void;
  setAutoSpeak: (autoSpeak: boolean) => void;
  setSupertonicSteps: (steps: SupertonicSteps) => void;
  setSupertonicLanguage: (language: string) => void;
  setUserTTSOverride: (override: boolean | null) => void;
}

function isVoice(v: unknown): v is Voice {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    (r.engine === "system" ||
      r.engine === "kitten" ||
      r.engine === "kokoro" ||
      r.engine === "supertonic")
  );
}

/** The persisted slice — everything in the blob except `loaded` and the setters. */
type PersistedVoiceState = Pick<
  VoiceState,
  "currentVoice" | "autoSpeak" | "supertonicSteps" | "supertonicLanguage" | "userTTSOverride"
>;

function parseVoiceState(raw: string | null): PersistedVoiceState {
  const fallback = {
    currentVoice: null as Voice | null,
    autoSpeak: true,
    supertonicSteps: DEFAULT_SUPERTONIC_STEPS,
    supertonicLanguage: DEFAULT_SUPERTONIC_LANGUAGE,
    userTTSOverride: null as boolean | null,
  };
  if (!raw) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
    const r = v as Record<string, unknown>;
    const steps = r.supertonicSteps as SupertonicSteps;
    return {
      currentVoice: isVoice(r.currentVoice) ? r.currentVoice : null,
      autoSpeak: typeof r.autoSpeak === "boolean" ? r.autoSpeak : true,
      // Guard the persisted enum — a hand-edited or stale blob must not
      // put an unsupported step count in front of the engine.
      supertonicSteps: SUPERTONIC_STEP_CHOICES.includes(steps)
        ? steps
        : DEFAULT_SUPERTONIC_STEPS,
      supertonicLanguage:
        typeof r.supertonicLanguage === "string" ? r.supertonicLanguage : DEFAULT_SUPERTONIC_LANGUAGE,
      userTTSOverride:
        typeof r.userTTSOverride === "boolean" ? r.userTTSOverride : null,
    };
  } catch {
    return fallback;
  }
}

export function createVoiceStore(
  storage: KeyValueStorage,
  /** Called after auto-speak flips so the engine can be released. Injected
   *  to keep native imports out of the store. */
  onAutoSpeak?: (enabled: boolean) => void,
) {
  return create<VoiceState>()((set, get) => {
    async function persist(): Promise<void> {
      const { currentVoice, autoSpeak, supertonicSteps, supertonicLanguage, userTTSOverride } = get();
      try {
        await storage.setItem(
          VOICE_KEY,
          JSON.stringify({ currentVoice, autoSpeak, supertonicSteps, supertonicLanguage, userTTSOverride }),
        );
      } catch {
        // Ignore persistence failures; voice settings are non-critical.
      }
    }

    return {
      currentVoice: null,
      autoSpeak: true,
      supertonicSteps: DEFAULT_SUPERTONIC_STEPS,
      supertonicLanguage: DEFAULT_SUPERTONIC_LANGUAGE,
      userTTSOverride: null,
      loaded: false,
      load: async () => {
        set({ ...parseVoiceState(await storage.getItem(VOICE_KEY)), loaded: true });
      },
      setVoice: (currentVoice) => {
        set({ currentVoice });
        void persist();
      },
      setAutoSpeak: (autoSpeak) => {
        set({ autoSpeak });
        void persist();
        onAutoSpeak?.(autoSpeak);
      },
      setSupertonicSteps: (supertonicSteps) => {
        set({ supertonicSteps });
        void persist();
      },
      setSupertonicLanguage: (supertonicLanguage) => {
        set({ supertonicLanguage });
        void persist();
      },
      setUserTTSOverride: (userTTSOverride) => {
        set({ userTTSOverride });
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
export const useVoice = createVoiceStore(
  {
    getItem: async (key) => (await rnStorage()).getItem(key),
    setItem: async (key, value) => {
      await (await rnStorage()).setItem(key, value);
    },
    removeItem: async (key) => {
      await (await rnStorage()).removeItem(key);
    },
  },
  // Turning auto-speak off hands the loaded engine's RAM back. Lazy import
  // keeps the native module out of the module graph until it is needed.
  (enabled) => {
    if (enabled) return;
    void import("../lib/tts/runtime.ts")
      .then((m) => m.ttsRuntime.release())
      .catch(() => {
        // nothing loaded to release
      });
  },
);