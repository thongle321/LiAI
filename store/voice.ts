/** Voice output: engine-tagged current voice, auto-speak, availability.
 *
 * PocketPal's TTSStore shape on LiAI's stack (spec Q14): persisted
 * `currentVoice` (engine-tagged), `autoSpeak` (default OFF — spec Q14),
 * and a trististate `userTTSOverride` for the RAM gate. Runtime state:
 * the playback state machine, a PER-ENGINE download map, and the cached
 * memory check behind `isTTSAvailable`.
 *
 * Per-engine, not kokoro-only: the screen lists three downloadable engines
 * (spec Q2 as reversed) and each needs its own install/progress/error.
 * PocketPal keeps three separate field triples for exactly this reason; a
 * map keyed by engine id is the same information without the switch
 * statements, and it makes the fourth engine a data change.
 *
 * Migration: the pre-engine blob `{ voiceId, autoSpeak }` and the
 * engine-era `{ currentVoice, autoSpeak }` both load here. Any OS voice id
 * collapses to the device-default system row (spec Q9 — system voices are
 * never enumerated or pinned); a neural voice survives only if it is still
 * in its engine's curated list.
 *
 * The factory takes storage so tests inject memory (see chat.ts pattern).
 * All native modules arrive through dynamic imports, so jest can
 * exercise this store with fakes.
 */

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../services/storage/storage.ts";
import { DEVICE_DEFAULT_VOICE, type NeuralEngineId, type Voice } from "../services/tts/types.ts";
import { ENGINE_ORDER, NEURAL_ENGINE_META } from "../services/tts/engineMeta.ts";
import { ttsDownloads, type TtsModelStatus } from "../services/tts/download.ts";
import { ttsRuntime } from "../services/tts/runtime.ts";
import { playVoice } from "../services/tts/voice-engine.ts";
import { readTotalMemory } from "../services/models/device-tiers.ts";

export const VOICE_KEY = "liai_voice";

/** The kokoro model id, kept as a named export because the spec pins it and
 *  the tests assert it. The value's single home is the engine table. */
export const KOKORO_MODEL_ID = NEURAL_ENGINE_META.kokoro.modelId;

/** PocketPal's gate: neural TTS needs a 4 GiB device (spec Q14). */
export const RAM_GATE_BYTES = 4 * 1024 * 1024 * 1024;

export type PlaybackState = { mode: "idle" } | { mode: "playing"; messageId?: string };

/** Every downloadable engine's download state. `null` per engine means
 *  UNKNOWN (node, or an unreadable disk) — never "not installed"; the two
 *  read differently in reconcileVoice and an unknown status must not
 *  silently demote a selected voice. */
export type EngineDownloads = Record<NeuralEngineId, TtsModelStatus | null>;

export const EMPTY_DOWNLOADS: EngineDownloads = {
  kitten: null,
  kokoro: null,
  supertonic: null,
};

/** A voice id stashed for an engine whose model was removed, restored the
 *  next time that engine finishes downloading (PocketPal's pendingVoiceRestore,
 *  in-memory, never persisted). */
export type StashedVoices = Partial<Record<NeuralEngineId, string>>;

export interface VoiceState {
  /** null ≡ the device-default system voice. */
  currentVoice: Voice | null;
  autoSpeak: boolean;
  /** null = no user decision; true/false forces availability. */
  userTTSOverride: boolean | null;
  playbackState: PlaybackState;
  /** Message id of the last auto-spoken reply, for once-per-turn playback. */
  lastSpokenMessageId: string | null;
  /** Per-engine voice stash, restored after a re-download. */
  pendingVoiceRestore: StashedVoices;
  /** Per-engine download states; null entries mean "not yet read". */
  downloads: EngineDownloads;
  /** The engine holding the single download slot, or null. The manager's
   *  runtime is one-slot, so other cards must not start a transfer. */
  activeEngineId: NeuralEngineId | null;
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
  /** Download one engine's model, reporting state transitions. Resolves
   *  with the local path, or null when the user paused it. */
  startEngineDownload: (engine: NeuralEngineId) => Promise<string | null>;
  /** Pause this engine's transfer; the manager keeps the partial bytes. */
  pauseEngineDownload: (engine: NeuralEngineId) => Promise<void>;
  /** Continue a paused transfer from the bytes already fetched. */
  resumeEngineDownload: (engine: NeuralEngineId) => Promise<string | null>;
  /** Delete one engine's model from disk, reclaiming its bytes. */
  removeEngineModel: (engine: NeuralEngineId) => Promise<void>;
}

type PersistedVoiceState = Pick<VoiceState, "currentVoice" | "autoSpeak" | "userTTSOverride">;

function isNeuralEngineId(value: unknown): value is NeuralEngineId {
  return typeof value === "string" && value in NEURAL_ENGINE_META;
}

function toVoice(value: unknown): Voice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as { id?: unknown; name?: unknown; engine?: unknown };
  if (typeof v.id !== "string" || v.id.length === 0) return null;
  return {
    id: v.id,
    name: typeof v.name === "string" ? v.name : v.id,
    engine: isNeuralEngineId(v.engine) ? v.engine : "system",
  };
}

/** Migration rule (Q9): the system engine has exactly one row — any
 *  persisted system voice (including a legacy OS voice id) collapses to
 *  the device default, and a neural voice survives only while it is still
 *  curated in its own engine's table. */
function sanitizeVoice(voice: Voice | null): Voice {
  if (voice === null) return DEVICE_DEFAULT_VOICE;
  if (voice.engine === "system") return DEVICE_DEFAULT_VOICE;
  return NEURAL_ENGINE_META[voice.engine].voices.some((v) => v.id === voice.id)
    ? voice
    : DEVICE_DEFAULT_VOICE;
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
    );
    return {
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
  downloads: EngineDownloads,
): { voice: Voice | null; stashed: StashedVoices } {
  // null means never-chosen — the device default by convention, with
  // nothing to stash. Only a selected voice can vanish.
  if (currentVoice === null) return { voice: null, stashed: {} };
  const voice = sanitizeVoice(currentVoice);
  if (voice.engine === "system") return { voice, stashed: {} };
  const status = downloads[voice.engine];
  if (status?.state === "not_installed" || status?.state === "error") {
    return { voice: DEVICE_DEFAULT_VOICE, stashed: { [voice.engine]: voice.id } };
  }
  return { voice, stashed: {} };
}

/** The other half of the reconcile: a stashed id becomes a voice again
 *  only while still curated in ITS engine, or null when the list moved on. */
export function restoreVoice(stashed: string, engine: NeuralEngineId): Voice | null {
  return NEURAL_ENGINE_META[engine].voices.find((v) => v.id === stashed) ?? null;
}

interface VoiceStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => VoiceState;
}

function toStateStorage(storage: KeyValueStorage): StateStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

export function createVoiceStore(storage: KeyValueStorage) {
  /** In-flight hydration, so concurrent `load()` callers share one read
   *  (the startup gate and the voice settings screen both call it). */
  let hydrating: Promise<void> | null = null;
  let api: VoiceStoreApi | null = null;
  let persistEnabled = false;

  const gatedStorage: KeyValueStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) =>
      persistEnabled ? storage.setItem(key, value) : Promise.resolve(),
    removeItem: (key) => storage.removeItem(key),
  };

  const created = create<VoiceState>()(
    persist(
      (set, get) => {
    /** Record one engine's status, and restore the voice stashed for it
     *  when its model finishes downloading (PocketPal's
     *  restore-after-re-download). Shared by download and resume. */
    function applyEngineStatus(engineId: NeuralEngineId, status: TtsModelStatus): void {
      set((s) => ({ downloads: { ...s.downloads, [engineId]: status } }));
      if (status.state !== "ready") return;
      const stashed = get().pendingVoiceRestore[engineId];
      if (stashed === undefined) return;
      set((s) => {
        const next = { ...s.pendingVoiceRestore };
        delete next[engineId];
        return { pendingVoiceRestore: next };
      });
      const restored = restoreVoice(stashed, engineId);
      if (restored !== null) set({ currentVoice: restored });
    }

    /** Reads persisted voice prefs, then reconciles what the disk says
     *  against what the TTS engines actually have installed.
     *
     *  `loaded` flips in a `finally`, so a storage read that rejects still
     *  releases the startup gate instead of holding the splash forever —
     *  the same contract the model store's hydrate has (D3-4). */
    async function hydrate(
      set: (partial: Partial<VoiceState>) => void,
      get: () => VoiceState,
    ): Promise<void> {
      try {
        if (api) await api.persist.rehydrate();
        // Reconcile every engine's download state from disk (spec Q14).
        // The native module is absent in node — a failed reconcile simply
        // leaves that engine's entry null.
        const downloads: EngineDownloads = { ...EMPTY_DOWNLOADS };
        for (const id of ENGINE_ORDER) {
          try {
            downloads[id] = await ttsDownloads.status(NEURAL_ENGINE_META[id].modelId);
          } catch {
            downloads[id] = null;
          }
        }
        const reconciled = reconcileVoice(get().currentVoice, downloads);
        set({
          downloads,
          currentVoice: reconciled.voice,
          pendingVoiceRestore: reconciled.stashed,
        });
        // A transfer the manager still holds from a previous session (paused,
        // or interrupted by a kill) reads as paused, so the card offers
        // Resume instead of starting a second transfer over the same path.
        try {
          const pending = await ttsDownloads.incomplete();
          const resumed: EngineDownloads = { ...get().downloads };
          for (const id of ENGINE_ORDER) {
            const modelId = NEURAL_ENGINE_META[id].modelId;
            const percent = pending[modelId];
            if (percent !== undefined && resumed[id]?.state === "not_installed") {
              resumed[id] = { state: "paused", percent };
            }
          }
          set({ downloads: resumed });
        } catch {
          // No native module (node) — the disk states above stand.
        }
        try {
          const total = await readTotalMemory();
          set({ deviceMeetsMemory: total !== null && total >= RAM_GATE_BYTES });
        } catch {
          set({ deviceMeetsMemory: false });
        }
      } finally {
        persistEnabled = true;
        set({ loaded: true });
      }
    }

    return {
      currentVoice: null,
      autoSpeak: false,
      userTTSOverride: null,
      playbackState: { mode: "idle" },
      lastSpokenMessageId: null,
      pendingVoiceRestore: {},
      downloads: { ...EMPTY_DOWNLOADS },
      activeEngineId: null,
      deviceMeetsMemory: false,
      loaded: false,

      load: async () => {
        // Single-flight, like the model and search stores' loads: the startup
        // gate and the voice settings screen both call this, and two
        // concurrent reconciles would race each other's `downloads` set.
        if (get().loaded) return;
        hydrating ??= (async () => {
          await hydrate(set, get);
        })().finally(() => {
          hydrating = null;
        });
        await hydrating;
      },

      isTTSAvailable: () => {
        const { userTTSOverride, deviceMeetsMemory } = get();
        return userTTSOverride ?? deviceMeetsMemory;
      },

      setCurrentVoice: (voice) => {
        set({ currentVoice: voice });
      },
      setAutoSpeak: (autoSpeak) => {
        set({ autoSpeak });
      },
      setUserTTSOverride: (userTTSOverride) => {
        set({ userTTSOverride });
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
        set({ playbackState: { mode: "playing", messageId: options.messageId } });
        try {
          await playVoice(text, voice, { speed: options.speed }, { stop: () => get().stop() });
        } catch {
          // A failed play must not wedge the state machine.
        } finally {
          if (get().playbackState.mode === "playing") {
            set({ playbackState: { mode: "idle" } });
          }
        }
      },

      stop: () => ttsRuntime.stop(),

      startEngineDownload: async (engineId) => {
        const { modelId } = NEURAL_ENGINE_META[engineId];
        set({ activeEngineId: engineId });
        try {
          return await ttsDownloads.download(modelId, (status) =>
            applyEngineStatus(engineId, status),
          );
        } finally {
          if (get().activeEngineId === engineId) set({ activeEngineId: null });
        }
      },

      pauseEngineDownload: async (engineId) => {
        const { modelId } = NEURAL_ENGINE_META[engineId];
        // Pause, never abort: the manager's abort path deletes the partial
        // archive. `download` settles with a paused status on PauseError.
        await ttsDownloads.pause(modelId);
      },

      resumeEngineDownload: async (engineId) => {
        const { modelId } = NEURAL_ENGINE_META[engineId];
        set({ activeEngineId: engineId });
        try {
          return await ttsDownloads.resume(modelId, (status) =>
            applyEngineStatus(engineId, status),
          );
        } finally {
          if (get().activeEngineId === engineId) set({ activeEngineId: null });
        }
      },

      removeEngineModel: async (engineId) => {
        const { modelId } = NEURAL_ENGINE_META[engineId];
        await ttsDownloads.remove(modelId);
        // A neural voice cannot survive its model, so stash it for the next
        // successful download of THIS engine and fall back meanwhile.
        const voice = get().currentVoice;
        if (voice?.engine === engineId) {
          set((s) => ({
            currentVoice: DEVICE_DEFAULT_VOICE,
            pendingVoiceRestore: { ...s.pendingVoiceRestore, [engineId]: voice.id },
          }));
        }
        set((s) => ({
          downloads: { ...s.downloads, [engineId]: { state: "not_installed", percent: 0 } },
        }));
      },
    };
  },
  {
    name: VOICE_KEY,
    storage: createJSONStorage(() => toStateStorage(gatedStorage)),
    skipHydration: true,
    partialize: (state: VoiceState) => ({
      currentVoice: state.currentVoice,
      autoSpeak: state.autoSpeak,
      userTTSOverride: state.userTTSOverride,
    }),
    merge: (persistedState, currentState) => {
      const r =
        persistedState && typeof persistedState === "object" && !Array.isArray(persistedState)
          ? (persistedState as Record<string, unknown>)
          : {};
      const hasVoice =
        r.currentVoice !== undefined ||
        (typeof r.voiceId === "string" && r.voiceId.length > 0);
      const currentVoice = hasVoice
        ? sanitizeVoice(
            r.currentVoice !== undefined
              ? toVoice(r.currentVoice)
              : DEVICE_DEFAULT_VOICE,
          )
        : currentState.currentVoice;
      return {
        ...currentState,
        currentVoice,
        autoSpeak:
          typeof r.autoSpeak === "boolean" ? r.autoSpeak : currentState.autoSpeak,
        userTTSOverride:
          typeof r.userTTSOverride === "boolean" ? r.userTTSOverride : currentState.userTTSOverride,
        loaded: currentState.loaded,
      };
    },
  },
  ));
  api = created as unknown as VoiceStoreApi;
  return created;
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