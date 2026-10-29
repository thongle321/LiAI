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
import { persist, createJSONStorage } from "zustand/middleware";
import type { KeyValueStorage } from "@/services/storage/storage.ts";
import { dedupedStorage, gatedStorage, toStateStorage } from "@/services/storage/persist-helpers";
import {
  DEVICE_DEFAULT_VOICE,
  type NeuralEngineId,
  type StreamingHandle,
  type Voice,
} from "@/services/tts/types.ts";
import { ThinkingStripper, pickThinkingPlaceholder } from "@/services/tts/thinkingStripper.ts";
import { stripForSpeech } from "@/utils/strip-for-speech.ts";
import type { SupertonicLanguage } from "@pocketpalai/react-native-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupertonicSteps } from "@/services/tts/types.ts";
import { ENGINE_ORDER, NEURAL_ENGINE_META } from "@/services/tts/engineMeta.ts";
import type { TtsModelStatus } from "@/services/tts/types.ts";
import { getEngine, getPhononSupport } from "@/services/tts/engineRegistry.ts";
import { ttsRuntime } from "@/services/tts/runtime.ts";
import { ensureVoiceFile } from "@/services/tts/voiceFiles.ts";
import { playVoice } from "@/services/tts/voice-engine.ts";
import { readTotalMemory } from "@/services/models/device-tiers.ts";

export const VOICE_KEY = "liai_voice";

/** PocketPal's gate: neural TTS needs a 4 GiB device (spec Q14). */
export const RAM_GATE_BYTES = 4 * 1024 * 1024 * 1024;
export const VOICE_FIRST_CHUNK_HOLD_MS = 1500;

export type PlaybackState =
  | { mode: "idle" }
  | { mode: "playing"; messageId?: string }
  | { mode: "streaming"; messageId: string; handle: StreamingHandle };

/** Every downloadable engine's download state. `null` per engine means
 *  UNKNOWN (node, or an unreadable disk) — never "not installed"; the two
 *  read differently in reconcileVoice and an unknown status must not
 *  silently demote a selected voice. */
export type EngineDownloads = Record<NeuralEngineId, TtsModelStatus | null>;

export const EMPTY_DOWNLOADS: EngineDownloads = {
  kitten: null,
  kokoro: null,
  supertonic: null,
  phonon: null,
};

/** A voice id stashed for an engine whose model was removed, restored the
 *  next time that engine finishes downloading (PocketPal's pendingVoiceRestore,
 *  in-memory, never persisted). */
export type StashedVoices = Partial<Record<NeuralEngineId, string>>;

export interface VoiceState {
  /** null ≡ the device-default system voice. */
  currentVoice: Voice | null;
  autoSpeak: boolean;
  voiceOutputActive: boolean;
  holdFirstChunk: boolean;
  supertonicSteps: SupertonicSteps;
  supertonicLanguage: SupertonicLanguage;
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
  phononSupported: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  /** override ?? deviceMeetsMemory — the single availability rule. */
  isTTSAvailable: () => boolean;
  /** Whether the next assistant reply opens a speech stream. */
  streamsReplies: () => boolean;
  /** PocketPal's offering gate: true for every neural engine; for Phonon,
   *  true only while the add-on probe reports the engine supported. */
  isEngineOffered: (engine: NeuralEngineId) => boolean;
  /** Re-probe Phonon support (reference's refreshPhononSupport): sets
   *  `phononSupported`, and when the probe says unsupported while a Phonon
   *  voice is selected, stops playback and falls back to the device
   *  default WITHOUT stashing the id — the files stay on disk and the
   *  stash path belongs to downloads, not support loss. */
  refreshPhononSupport: () => Promise<void>;
  setCurrentVoice: (voice: Voice | null) => void;
  setAutoSpeak: (autoSpeak: boolean) => void;
  setVoiceOutputActive: (active: boolean) => void;
  setHoldFirstChunk: (hold: boolean) => void;
  setSupertonicSteps: (steps: SupertonicSteps) => void;
  setSupertonicLanguage: (language: SupertonicLanguage) => void;
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
  onAssistantMessageStart: (messageId: string) => void;
  onAssistantMessageChunk: (messageId: string, chunkText: string, reasoningDelta?: string) => void;
  onAssistantMessageComplete: (messageId: string, text: string, opts?: { hadReasoning?: boolean }) => Promise<void>;
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
  return NEURAL_ENGINE_META[voice.engine]!.voices.some((v) => v.id === voice.id)
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
  return NEURAL_ENGINE_META[engine]!.voices.find((v) => v.id === stashed) ?? null;
}

interface VoiceStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => VoiceState;
}

export function createVoiceStore(storage: KeyValueStorage) {
  /** In-flight hydration, so concurrent `load()` callers share one read
   *  (the startup gate and the voice settings screen both call it). */
  let hydrating: Promise<void> | null = null;
  let api: VoiceStoreApi | null = null;
  let persistEnabled = false;
  let streamStripper: ThinkingStripper | null = null;
  let streamPlaceholderEmitted = false;
  let voiceStream: { messageId: string; held: string[] | null; holdTimer: ReturnType<typeof setTimeout> | null; chars: number } | null = null;
  let voiceSpeechStarted: string | null = null;

  const gated = gatedStorage(dedupedStorage(storage), () => persistEnabled);

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
            const installed = await getEngine(id).isInstalled();
            downloads[id] = installed
              ? { state: "ready", percent: 100 }
              : { state: "not_installed", percent: 0 };
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
        // PocketPal engines manage their own downloads; no cross-session
        // resume probe is available here. Disk state above stands.
        // PocketPal's init-reconcile for Phonon: the add-on probe decides
        // whether the engine is offered on this device at all. Runs through
        // refreshPhononSupport so an unsupported probe also clears a
        // persisted Phonon voice (without stashing it).
        try {
          await get().refreshPhononSupport();
        } catch {
          set({ phononSupported: false });
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
      voiceOutputActive: false,
      holdFirstChunk: false,
      supertonicSteps: 5,
      supertonicLanguage: "na" as SupertonicLanguage,
      userTTSOverride: null,
      playbackState: { mode: "idle" },
      lastSpokenMessageId: null,
      pendingVoiceRestore: {},
      downloads: { ...EMPTY_DOWNLOADS },
      activeEngineId: null,
      deviceMeetsMemory: false,
      phononSupported: false,
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

      streamsReplies: () => {
        const { voiceOutputActive, autoSpeak } = get();
        return voiceOutputActive || (get().isTTSAvailable() && autoSpeak);
      },

      isEngineOffered: (engine) => {
        const { phononSupported } = get();
        return engine !== "phonon" || phononSupported;
      },

      refreshPhononSupport: async () => {
        let supported: boolean;
        try {
          supported = (await getPhononSupport()).supported;
        } catch {
          supported = false;
        }
        set({ phononSupported: supported });
        if (supported) return;
        if (get().currentVoice?.engine !== "phonon") return;
        await get().stop().catch(() => {});
        if (get().currentVoice?.engine === "phonon") {
          set({ currentVoice: DEVICE_DEFAULT_VOICE });
        }
      },

      setCurrentVoice: (voice) => {
        set({ currentVoice: voice });
      },
      setAutoSpeak: (autoSpeak) => {
        set({ autoSpeak });
      },
      setVoiceOutputActive: (voiceOutputActive) => {
        set({ voiceOutputActive });
      },
      setHoldFirstChunk: (holdFirstChunk) => {
        set({ holdFirstChunk });
      },
      setSupertonicSteps: (supertonicSteps) => {
        set({ supertonicSteps });
      },
      setSupertonicLanguage: (supertonicLanguage) => {
        set({ supertonicLanguage });
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
        const playing = { mode: "playing" as const, messageId: options.messageId };
        set({ playbackState: playing });
        try {
          await ensureVoiceFile(voice);
          if (get().playbackState !== playing) return;
          await playVoice(text, voice, { speed: options.speed }, { stop: () => get().stop() });
        } catch {
          // A failed play must not wedge the state machine.
          if (voice.engine === "phonon") {
            void get().refreshPhononSupport();
          }
        } finally {
          if (get().playbackState.mode === "playing") {
            set({ playbackState: { mode: "idle" } });
          }
        }
      },

      stop: () => {
        const state = get().playbackState;
        if (state.mode === "streaming") {
          if (voiceStream?.holdTimer) clearTimeout(voiceStream.holdTimer);
          voiceStream = null;
          voiceSpeechStarted = null;
          void state.handle.cancel();
          set({ playbackState: { mode: "idle" } });
          streamStripper = null;
          streamPlaceholderEmitted = false;
        } else if (state.mode === "playing") {
          set({ playbackState: { mode: "idle" } });
        }
        return ttsRuntime.stop();
      },

      onAssistantMessageStart: (messageId) => {
        if (!get().streamsReplies()) return;
        if (get().lastSpokenMessageId === messageId) return;
        const voice = get().currentVoice ?? DEVICE_DEFAULT_VOICE;
        const engine = getEngine(voice.engine);
        const stopDone = get().stop().catch(() => undefined);
        const voiceReady = stopDone.then(() => ensureVoiceFile(voice)).then(() => undefined);
        set({ lastSpokenMessageId: messageId });
        streamStripper = new ThinkingStripper();
        streamPlaceholderEmitted = false;

        // Voice-mode hold: buffer the first chunk briefly so a voice reply
        // doesn't start speaking before the model's first sentence lands.
        let streamOpts: { firstChunk?: "clause"; onProgress?: (e: { chunkIndex: number; chunkText: string }) => void } | undefined;
        if (get().voiceOutputActive && get().holdFirstChunk) {
          voiceStream = {
            messageId,
            held: [],
            holdTimer: setTimeout(() => {
              // release held text
              const vs = voiceStream;
              const st = get().playbackState;
              if (!vs || vs.messageId !== messageId || !vs.held) return;
              if (vs.holdTimer) clearTimeout(vs.holdTimer);
              vs.holdTimer = null;
              const held = vs.held;
              vs.held = null;
              if (st.mode !== "streaming" || st.messageId !== messageId) return;
              for (const t of held) st.handle.appendText(t);
            }, VOICE_FIRST_CHUNK_HOLD_MS),
            chars: 0,
          };
          streamOpts = {
            firstChunk: "clause",
            onProgress: () => {
              if (voiceStream?.messageId === messageId) {
                voiceSpeechStarted = messageId;
              }
            },
          };
        } else {
          voiceStream = null;
        }

        const supertonicOpts =
          voice.engine === "supertonic"
            ? {
                language: get().supertonicLanguage,
                inferenceSteps: get().supertonicSteps,
                ...streamOpts,
              }
            : streamOpts;
        try {
          const handle = engine.playStreaming(voice, voiceReady, supertonicOpts);
          set({ playbackState: { mode: "streaming", messageId, handle } });
        } catch (err) {
          console.warn("[voice] streaming start failed:", err);
          // Clear the spoken mark so onAssistantMessageComplete can use the
          // installed-gated oneshot replay path.
          set({ lastSpokenMessageId: null });
          streamStripper = null;
          streamPlaceholderEmitted = false;
          voiceStream = null;
          voiceSpeechStarted = null;
          const ps = get().playbackState;
          if (ps.mode === "streaming" && ps.messageId === messageId) {
            set({ playbackState: { mode: "idle" } });
          }
        }
      },

      onAssistantMessageChunk: (messageId, chunkText, reasoningDelta) => {
        const state = get().playbackState;
        if (state.mode !== "streaming") return;
        if (state.messageId !== messageId) return;
        const stripper = streamStripper;
        const appendReply = (text: string): void => {
          if (voiceStream?.held) {
            voiceStream.held.push(text);
            voiceStream.chars += text.length;
          } else {
            state.handle.appendText(text);
          }
        };
        if (!stripper) {
          if (chunkText) appendReply(chunkText);
          return;
        }
        if (reasoningDelta) stripper.noteReasoning(reasoningDelta);
        const cleaned = chunkText ? stripper.feed(chunkText) : "";
        if (
          stripper.hadNonEmptyThink() &&
          !streamPlaceholderEmitted &&
          cleaned.length === 0 &&
          chunkText.length > 0
        ) {
          streamPlaceholderEmitted = true;
          appendReply(`${pickThinkingPlaceholder()} `);
          return;
        }
        if (cleaned.length > 0) {
          if (stripper.hadNonEmptyThink() && !streamPlaceholderEmitted) {
            streamPlaceholderEmitted = true;
            appendReply(`${pickThinkingPlaceholder()} `);
          }
          appendReply(cleaned);
        }
      },

      onAssistantMessageComplete: async (messageId, text, opts) => {
        const state = get().playbackState;
        if (state.mode === "streaming" && state.messageId === messageId) {
          const stripper = streamStripper;
          // Release any held first-chunk text before finalizing.
          if (voiceStream && voiceStream.messageId === messageId && voiceStream.held) {
            if (voiceStream.holdTimer) clearTimeout(voiceStream.holdTimer);
            voiceStream.holdTimer = null;
            const held = voiceStream.held;
            voiceStream.held = null;
            for (const t of held) state.handle.appendText(t);
          }
          if (stripper) {
            const leftover = stripper.flush();
            if (leftover.length > 0) {
              if (stripper.hadNonEmptyThink() && !streamPlaceholderEmitted) {
                streamPlaceholderEmitted = true;
                state.handle.appendText(`${pickThinkingPlaceholder()} `);
              }
              state.handle.appendText(leftover);
            }
          }
          let finalized = true;
          try {
            await state.handle.finalize();
          } catch (err) {
            console.warn("[voice] finalize failed:", err);
            finalized = false;
          } finally {
            const ps = get().playbackState;
            if (ps.mode === "streaming" && ps.messageId === messageId) {
              set({ playbackState: { mode: "idle" } });
              streamStripper = null;
              streamPlaceholderEmitted = false;
              voiceStream = null;
              voiceSpeechStarted = null;
            }
          }
          if (finalized) {
            return;
          }
          // Fall through to the replay path so a failed stream can still
          // speak the completed reply (especially for neural voices).
          set({ lastSpokenMessageId: null });
        }
        // Fallback replay path (missed start or non-streaming).
        if (!get().streamsReplies()) return;
        if (get().lastSpokenMessageId === messageId) return; // already handled by streaming
        set({ lastSpokenMessageId: messageId });
        if (text.trim() === "") return;
        void get().play(stripForSpeech(text), {
          messageId,
          voice: get().currentVoice ?? DEVICE_DEFAULT_VOICE,
        });
      },

      startEngineDownload: async (engineId) => {
        set({ activeEngineId: engineId });
        try {
          const engine = getEngine(engineId) as unknown as {
            downloadModel: (cb?: (p: number) => void) => Promise<void>;
            reclaimLegacySpace?: () => Promise<void>;
          };
          await engine.reclaimLegacySpace?.();
          await engine.downloadModel((p) =>
            applyEngineStatus(engineId, { state: "downloading", percent: p * 100 }),
          );
          const voices = await (engine as unknown as { getVoices: () => Promise<Voice[]> }).getVoices().catch(() => []);
          applyEngineStatus(engineId, { state: "ready", percent: 100 });
          if (get().currentVoice === null && voices.length > 0) {
            const stashed = get().pendingVoiceRestore[engineId];
            const restored = stashed !== undefined ? restoreVoice(stashed, engineId) : null;
            set({ currentVoice: restored ?? voices[0] });
          }
          return null;
        } catch (err) {
          applyEngineStatus(engineId, { state: "error", percent: 0, error: String(err) });
          if (engineId === "phonon") {
            void get().refreshPhononSupport();
          }
          throw err;
        } finally {
          if (get().activeEngineId === engineId) set({ activeEngineId: null });
        }
      },

      pauseEngineDownload: async (engineId) => {
        // PocketPal engines do not support pause; no-op.
        void engineId;
      },

      resumeEngineDownload: async (engineId) => {
        return await get().startEngineDownload(engineId);
      },

      removeEngineModel: async (engineId) => {
        const engine = getEngine(engineId) as unknown as { deleteModel: () => Promise<void> };
        await engine.deleteModel();
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
    storage: createJSONStorage(() => toStateStorage(gated)),
    skipHydration: true,
    partialize: (state: VoiceState) => ({
      currentVoice: state.currentVoice,
      autoSpeak: state.autoSpeak,
      supertonicSteps: state.supertonicSteps,
      supertonicLanguage: state.supertonicLanguage,
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
        supertonicSteps:
          typeof r.supertonicSteps === "number" ? (r.supertonicSteps as SupertonicSteps) : currentState.supertonicSteps,
        supertonicLanguage:
          typeof r.supertonicLanguage === "string" ? (r.supertonicLanguage as SupertonicLanguage) : currentState.supertonicLanguage,
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

/* App singleton backed on-device AsyncStorage. AsyncStorage is a static,
 * module-mapped import (the ASR store's pattern): it is a pure JS KV with a
 * jest fake, and a dynamic import here throws in node ("dynamic import
 * callback without --experimental-vm-modules"), which any hydrate on the
 * jested singleton would hit. */
export const useVoice = createVoiceStore({
  getItem: async (key) => await AsyncStorage.getItem(key),
  setItem: async (key, value) => {
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    await AsyncStorage.removeItem(key);
  },
});