/** Voice output: engine-tagged current voice, auto-speak, availability.
 *
 * PocketPal's TTSStore shape on LiAI's stack (spec Q14): persisted
 * `currentVoice` (engine-tagged), `autoSpeak` (default OFF — spec Q14),
 * and a trististate `userTTSOverride` for the RAM gate. Runtime state:
 * the playback state machine, the kokoro download triplet, and the
 * cached memory check behind `isTTSAvailable`.
 *
 * Migration: the pre-engine blob `{ voiceId, autoSpeak }` and the
 * engine-era `{ currentVoice, autoSpeak }` both load here. Any OS voice
 * id collapses to the device-default system row (spec Q9 — system
 * voices are never enumerated or pinned); a kokoro voice survives only
 * if it is still in the curated list.
 *
 * The factory takes storage so tests inject memory (see chat.ts pattern).
 * All native modules arrive through dynamic imports, so node --test can
 * exercise this store with fakes.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage.ts";
import { DEVICE_DEFAULT_VOICE, type Voice } from "../lib/tts/types.ts";
import { KOKORO_VOICES } from "../lib/tts/engines/kokoro.ts";
import { getEngine } from "../lib/tts/engineRegistry.ts";
import { ttsDownloads, type TtsModelStatus } from "../lib/tts/download.ts";
import { ttsRuntime } from "../lib/tts/runtime.ts";
import { readTotalMemory } from "../lib/models/device-tiers.ts";

export const VOICE_KEY = "liai_voice_v2";

/** Kokoro model id from the download bridge (spec Q8 + ticket 02). */
export const KOKORO_MODEL_ID = "kokoro-int8-en-v0_19";

/** PocketPal's gate: neural TTS needs a 4 GiB device (spec Q14). */
export const RAM_GATE_BYTES = 4 * 1024 * 1024 * 1024;

export type PlaybackState = { mode: "idle" } | { mode: "playing"; messageId?: string };

export interface VoiceState {
  /** null ≡ the device-default system voice. */
  currentVoice: Voice | null;
  autoSpeak: boolean;
  /** null = no user decision; true/false forces availability. */
  userTTSOverride: boolean | null;
  playbackState: PlaybackState;
  /** Message id of the last auto-spoken reply, for once-per-turn playback. */
  lastSpokenMessageId: string | null;
  /** Stashed kokoro voice id, restored on the next successful download
   *  (PocketPal's pendingVoiceRestore — in-memory, never persisted). */
  pendingVoiceRestore: string | null;
  /** Kokoro download triplet; null when unreadable (node tests). */
  download: TtsModelStatus | null;
  deviceMeetsMemory: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  /** override ?? deviceMeetsMemory — the single availability rule. */
  isTTSAvailable: () => boolean;
  setCurrentVoice: (voice: Voice | null) => void;
  setAutoSpeak: (autoSpeak: boolean) => void;
  setUserTTSOverride: (override: boolean | null) => void;
  /** Record that `messageId` was spoken, so repeats do not re-speak it. */
  markSpoken: (messageId: string) => void;
  /** Forget a spoken mark when a new run starts for the same message
   *  (retry/regenerate reuses the bubble id — a stale mark would silence
   *  the new reply). */
  clearSpoken: (messageId: string) => void;
  /** Speak `text` through the selected engine (spec Q14 "one API"). */
  play: (text: string, options?: { messageId?: string; voice?: Voice; speed?: number }) => Promise<void>;
  stop: () => Promise<void>;
  /** Download the kokoro model, reporting state transitions. */
  startKokoroDownload: () => Promise<string>;
  /** Cancel the in-flight kokoro download (no-op when idle). */
  cancelKokoroDownload: () => void;
  /** Delete the kokoro model from disk, reclaiming its bytes. Stashes the
   *  active kokoro voice for the next download and falls back to the
   *  device default meanwhile. */
  removeKokoroModel: () => Promise<void>;
}

type PersistedVoiceState = Pick<VoiceState, "currentVoice" | "autoSpeak" | "userTTSOverride">;

function toVoice(value: unknown): Voice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as { id?: unknown; name?: unknown; engine?: unknown };
  if (typeof v.id !== "string" || v.id.length === 0) return null;
  return {
    id: v.id,
    name: typeof v.name === "string" ? v.name : v.id,
    engine: v.engine === "kokoro" ? "kokoro" : "system",
  };
}

/** Migration rule (Q9): the system engine has exactly one row — any
 *  persisted system voice collapses to the device default, and a kokoro
 *  voice survives only while still curated. */
function sanitizeVoice(voice: Voice | null): Voice {
  if (voice === null) return DEVICE_DEFAULT_VOICE;
  // The system engine has exactly one row — any persisted system voice
  // (including a legacy OS voice id) collapses to the device default.
  if (voice.engine !== "kokoro") return DEVICE_DEFAULT_VOICE;
  // A kokoro voice survives only while still curated.
  return KOKORO_VOICES.some((v) => v.id === voice.id) ? voice : DEVICE_DEFAULT_VOICE;
}

function parseVoiceState(raw: string | null): PersistedVoiceState {
  const fallback: PersistedVoiceState = {
    currentVoice: null,
    autoSpeak: false,
    userTTSOverride: null,
  };
  if (!raw) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
    const r = v as Record<string, unknown>;
    // Explicit currentVoice wins; a legacy voiceId collapses to the
    // device default (Q9 — OS voices are never pinned).
    const currentVoice = sanitizeVoice(
      r.currentVoice !== undefined
        ? toVoice(r.currentVoice)
        : typeof r.voiceId === "string" && r.voiceId.length > 0
          ? DEVICE_DEFAULT_VOICE
          : null,
    );    return {
      currentVoice,
      autoSpeak: typeof r.autoSpeak === "boolean" ? r.autoSpeak : false,
      userTTSOverride:
        typeof r.userTTSOverride === "boolean" ? r.userTTSOverride : null,
    };
  } catch {
    return fallback;
  }
}

/** PocketPal's init-reconcile (spec Q14): clear-then-stash a persisted
 *  voice whose model vanished. An unknown download state (node, or an
 *  unreadable disk) leaves the voice alone — unknown is not vanished. */
export function reconcileVoice(
  currentVoice: Voice | null,
  download: TtsModelStatus | null,
): { voice: Voice | null; stashed: string | null } {
  // null means never-chosen — the device default by convention, with
  // nothing to stash. Only a selected voice can vanish.
  if (currentVoice === null) return { voice: null, stashed: null };
  const voice = sanitizeVoice(currentVoice);
  if (
    voice.engine === "kokoro" &&
    (download?.state === "not_installed" || download?.state === "error")
  ) {
    return { voice: DEVICE_DEFAULT_VOICE, stashed: voice.id };
  }
  return { voice, stashed: null };
}

/** The other half of the reconcile: a stashed id becomes a voice again
 *  only while still curated, or null when the list moved on. */
export function restoreVoice(stashed: string): Voice | null {
  return KOKORO_VOICES.find((v) => v.id === stashed) ?? null;
}

export function createVoiceStore(storage: KeyValueStorage) {
  return create<VoiceState>()((set, get) => {
    async function persist(): Promise<void> {
      const { currentVoice, autoSpeak, userTTSOverride } = get();
      try {
        await storage.setItem(
          VOICE_KEY,
          JSON.stringify({ currentVoice, autoSpeak, userTTSOverride }),
        );
      } catch {
        // Ignore persistence failures; voice settings are non-critical.
      }
    }

    return {
      currentVoice: null,
      autoSpeak: false,
      userTTSOverride: null,
      playbackState: { mode: "idle" },
      lastSpokenMessageId: null,
      pendingVoiceRestore: null,
      download: null,
      deviceMeetsMemory: false,
      loaded: false,

      load: async () => {
        const parsed = parseVoiceState(await storage.getItem(VOICE_KEY));
        set({ ...parsed, loaded: true });
        // Reconcile the kokoro download state from disk (spec Q14). The
        // native module is absent in node — a failed reconcile simply
        // leaves the triplet null.
        let download: TtsModelStatus | null = null;
        try {
          download = await ttsDownloads.status(KOKORO_MODEL_ID);
        } catch {
          download = null;
        }
        const reconciled = reconcileVoice(parsed.currentVoice, download);
        set({
          download,
          currentVoice: reconciled.voice,
          pendingVoiceRestore: reconciled.stashed,
        });
        try {
          const total = await readTotalMemory();
          set({ deviceMeetsMemory: total !== null && total >= RAM_GATE_BYTES });
        } catch {
          set({ deviceMeetsMemory: false });
        }
      },

      isTTSAvailable: () => {
        const { userTTSOverride, deviceMeetsMemory } = get();
        return userTTSOverride ?? deviceMeetsMemory;
      },

      setCurrentVoice: (voice) => {
        set({ currentVoice: voice });
        void persist();
      },
      setAutoSpeak: (autoSpeak) => {
        set({ autoSpeak });
        void persist();
      },
      setUserTTSOverride: (userTTSOverride) => {
        set({ userTTSOverride });
        void persist();
      },
      markSpoken: (messageId) => {
        set({ lastSpokenMessageId: messageId });
      },
      clearSpoken: (messageId) => {
        if (get().lastSpokenMessageId === messageId) {
          set({ lastSpokenMessageId: null });
        }
      },

      play: async (text, options = {}) => {
        const voice = options.voice ?? get().currentVoice ?? DEVICE_DEFAULT_VOICE;
        const engine = getEngine(voice.engine);
        const installed = await engine.isInstalled().catch(() => false);
        if (!installed) {
          // Nothing to say through this engine right now — stop cleanly so
          // a previous utterance cannot keep talking over the silence.
          await get().stop();
          return;
        }
        set({ playbackState: { mode: "playing", messageId: options.messageId } });
        try {
          await ttsRuntime.acquire(engine, () =>
            engine.play(text, voice, {
              ...(voice.engine === "kokoro"
                ? { sid: KOKORO_VOICES.findIndex((v) => v.id === voice.id) }
                : {}),
              ...(options.speed !== undefined ? { speed: options.speed } : {}),
            }),
          );
        } catch {
          // A failed play must not wedge the state machine.
        } finally {
          if (get().playbackState.mode === "playing") {
            set({ playbackState: { mode: "idle" } });
          }
        }
      },

      stop: () => ttsRuntime.stop(),

      startKokoroDownload: async () =>
        ttsDownloads.download(KOKORO_MODEL_ID, (status) => {
          set({ download: status });
          // A finished download restores the voice stashed at load
          // (PocketPal's restore-after-re-download, spec Q14).
          if (status.state === "ready") {
            const stashed = get().pendingVoiceRestore;
            if (stashed !== null) {
              set({ pendingVoiceRestore: null });
              const restored = restoreVoice(stashed);
              if (restored !== null) set({ currentVoice: restored });
            }
          }
        }),

      cancelKokoroDownload: () => {
        ttsDownloads.abort();
      },

      removeKokoroModel: async () => {
        await ttsDownloads.remove(KOKORO_MODEL_ID);
        // A kokoro voice cannot survive its model, so stash it for the next
        // successful download and fall back to the device default meanwhile.
        const voice = get().currentVoice;
        if (voice?.engine === "kokoro") {
          set({ currentVoice: DEVICE_DEFAULT_VOICE, pendingVoiceRestore: voice.id });
        }
        set({ download: { state: "not_installed", percent: 0 } });
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

/** App singleton backed on-device AsyncStorage. */
export const useVoice = createVoiceStore({
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
});
