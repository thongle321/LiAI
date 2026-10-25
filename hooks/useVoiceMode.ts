/** One hands-free voice session, ported from PocketPal's useVoiceMode
 *  controller (#1007/#1017) onto LiAI's stack: Whisper STT (Endpointer)
 *  + the cascade engine, through the same chat store send path as typed
 *  chat.
 *
 *  Recorded divergences (docs/specs/2026-10-25-voice-unified-whisper.md):
 *  no Plus teaser/paywall, no mute or audio-interruption wiring (no
 *  speech-capture native module to interrupt), no per-turn speech_failed
 *  (the voice store has no per-turn speech bookkeeping), and entry always
 *  speaks — the session IS the TTS surface, so the old autoSpeak gate is
 *  not consulted. Phases live in React state (no voiceModeStore here).
 *
 *  The hook is the only consumer interface; the class is internal. The
 *  deps options are seams for tests and let the screen pass navigation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { useIsFocused } from "expo-router";
import * as Haptics from "expo-haptics";
import { toByteArray } from "base64-js";
import { useAudioRecorder, type AudioDataEvent } from "@siteed/audio-studio";

import { createKeepAwake } from "@/services/chat/keep-awake.ts";
import { ASR_SAMPLE_RATE } from "@/services/asr/constants.ts";
import type { AsrTier } from "@/services/asr/types.ts";
import { selectEngineSource } from "@/services/inference/engine.ts";
import { activeChatModelBytes } from "@/services/asr/availability.ts";
import { readTotalMemory } from "@/services/models/device-tiers.ts";
import { CascadeVoiceEngine } from "@/services/voice/cascade-engine.ts";
import { chatVoicePort, type VoiceChatPort } from "@/services/voice/chat-port.ts";
import { voiceMemoryFit, type DeviceMemory } from "@/services/voice/memory-fit.ts";
import { Endpointer } from "@/services/voice/endpointer.ts";
import { VOICE_CAPTURE_SETTLE_MS, VOICE_MIC_WATCHDOG_MS, VOICE_START_TIMEOUT_MS } from "@/services/voice/constants.ts";
import { int16PcmToFloat32 } from "@/services/asr/energyVad.ts";
import type {
  VoiceEngine,
  VoiceTurn,
  VoiceTurnOutcome,
} from "@/services/voice/types.ts";
import { checkMicAccess } from "@/services/voice/mic-access.ts";
import { asrStore } from "@/store/asr.ts";
import { useModelStore } from "@/store/model-store.ts";
import { useVoice } from "@/store/voice.ts";

import type { VoiceModePhase } from "@/services/voice/voice-status.ts";

/** A distinct tag: ending a chat turn's wake lock must not cut a live
 *  voice session (each holder keeps its own lock). */
const voiceLock = createKeepAwake(
  () => import("expo-keep-awake"),
  "liai-voice-mode",
);

/** The sheet state a session can hold while its phases stay "closed". */
export type VoiceModeSheet =
  | { kind: "setup" }
  | { kind: "memory"; fit: ReturnType<typeof voiceMemoryFit> }
  | null;

/** The mic, as the controller sees it: a stream of int16 PCM bytes. */
export interface VoiceCapture {
  start(onChunk: (pcm: Uint8Array) => void): Promise<void>;
  stop(): void;
}

/** Optional overrides; every hole is filled with the real binding at
 *  first render (defaults are read once, like the reference's mount). */
export interface VoiceModeDeps {
  engine?: VoiceEngine;
  port?: VoiceChatPort;
  capture?: VoiceCapture;
  isModelReady?: () => boolean;
  deviceMemory?: () => Promise<DeviceMemory | null>;
  chatBytes?: () => Promise<number>;
  /** Route away to the model picker (no model loaded for a voice turn). */
  openModels?: () => void;
  /** Every live mic chunk as -1..1 float samples (50 ms at 16 kHz) —
   *  the level feed for the voice orb's SharedValues. UI-only: the
   *  endpointer still consumes the raw bytes; this never gates a turn. */
  onMicAudio?: (pcm: Float32Array) => void;
}

export interface VoiceCaptions {
  heard: string;
  reply: string | null;
  issue: string | null;
  needsMicSettings: boolean;
}

type CaptionPatch = Partial<VoiceCaptions>;

const FAILURES: Partial<Record<VoiceTurnOutcome, string>> = {
  transcribe_failed: "Couldn't transcribe that. Try speaking again.",
  reply_failed: "Couldn't send that. Try again.",
};

const withStartTimeout = (loading: Promise<void>): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("voice mode took too long to start")),
      VOICE_START_TIMEOUT_MS,
    );
  });
  return Promise.race([loading, timeout]).finally(() => clearTimeout(timer));
};

class VoiceModeController {
  private open = false;
  private disposed = false;
  private session = 0;
  private phaseState: VoiceModePhase = "closed";
  private exiting: Promise<void> | null = null;
  private turn: VoiceTurn | null = null;
  private readonly endpointer = new Endpointer();
  private micWatchdog: ReturnType<typeof setTimeout> | null = null;
  private micRetried = false;
  private captureSettled: Promise<void> = Promise.resolve();
  private micStarting: Promise<void> | null = null;

  constructor(
    private readonly deps: Required<VoiceModeDeps>,
    private readonly hooks: {
      phase: (phase: VoiceModePhase) => void;
      captions: (patch: CaptionPatch) => void;
      sheet: (sheet: VoiceModeSheet) => void;
    },
  ) {
    // The reply caption lands as soon as the run settles — usually while
    // the speech is still going; the phase flips via the engine's
    // speechStarted event.
    this.deps.port.onReply = (text) => {
      if (this.open) this.hooks.captions({ reply: text });
    };
  }

  async requestEntry(): Promise<void> {
    if (this.open || this.disposed) return;
    if (!this.deps.isModelReady()) {
      this.hooks.captions({
        issue: "Load a chat model first — pick one in Models.",
      });
      this.hooks.sheet(null);
      this.deps.openModels();
      return;
    }
    // Mic state is read WITHOUT prompting: the ask belongs to the setup
    // sheet (reference isSetupComplete → VoiceSetupSheet). A permanent
    // denial is beyond the sheet though — LiAI's sheet has no settings
    // affordance, so that state keeps the issue line's Settings link
    // (recorded divergence), as does a stale dev build.
    const mic = await checkMicAccess();
    if (this.open || this.disposed) return;
    if (mic === "settings") {
      this.hooks.captions({
        needsMicSettings: true,
        issue: "Microphone is blocked — enable it in Settings.",
      });
      return;
    }
    if (mic === "unavailable") {
      this.hooks.captions({
        needsMicSettings: false,
        issue: "Voice isn't available in this build — rebuild the dev client.",
      });
      return;
    }
    // The setup gate: tier ready AND mic already granted. Everything else
    // is what VoiceSetupSheet exists to fix (tier download and/or the ask).
    if (!asrStore.isSelectedTierReady || mic !== "granted") {
      this.hooks.sheet({ kind: "setup" });
      return;
    }
    await this.checkMemoryAndEnter();
  }

  async checkMemoryAndEnter(): Promise<void> {
    await this.exiting;
    if (this.open || this.disposed) {
      this.hooks.sheet(null);
      return;
    }
    if (!asrStore.isSelectedTierReady) {
      this.hooks.sheet({ kind: "setup" });
      return;
    }
    const tier = asrStore.selectedTier;
    const fit = voiceMemoryFit({
      memory: await this.deps.deviceMemory(),
      chatBytes: await this.deps.chatBytes(),
      sttTier: tier,
      // LiAI: no measured engine RAM exists, so no tts row (divergence).
      ttsBytes: 0,
    });
    if (fit.status === "fits") {
      this.hooks.sheet(null);
      await this.enter(tier);
    } else {
      this.hooks.sheet({ kind: "memory", fit });
    }
  }

  /** Enters with the tier the memory sheet counted, or re-runs entry if
   *  it changed underneath (the reference's continueAnyway contract). */
  async continueAnyway(tier: AsrTier): Promise<void> {
    await this.exiting;
    this.hooks.sheet(null);
    if (this.open || this.disposed) return;
    if (asrStore.selectedTier !== tier || !asrStore.isSelectedTierReady) {
      await this.requestEntry();
      return;
    }
    await this.enter(tier);
  }

  /** The memory sheet's way into the picker (a smaller chat model). */
  openModelPicker(): void {
    this.hooks.sheet(null);
    this.deps.openModels();
  }

  async setupDone(): Promise<void> {
    this.hooks.sheet(null);
    await this.requestEntry();
  }

  private setPhase(phase: VoiceModePhase): void {
    this.phaseState = phase;
    this.hooks.phase(phase);
  }

  private isListening(session: number): boolean {
    return (
      session === this.session &&
      this.open &&
      this.phaseState === "listening"
    );
  }

  private async enter(tier: AsrTier): Promise<void> {
    await this.exiting;
    if (this.open || this.disposed) return;
    this.open = true;
    const session = ++this.session;
    this.setPhase("starting");
    // Any speech from before the session goes quiet first.
    useVoice.getState().stop().catch(() => {});
    void voiceLock.holdScreen();
    try {
      await withStartTimeout(this.deps.engine.prepare(tier));
    } catch (err) {
      console.warn("[voiceMode] prepare failed:", err);
      if (session === this.session) {
        this.notifyError("Taking too long to load — tap the mic to try again.");
        this.exit("start_failed");
      }
      return;
    }
    if (session !== this.session || !this.open) return;
    this.hooks.captions({
      heard: "",
      reply: null,
      issue: null,
      needsMicSettings: false,
    });
    void Haptics.selectionAsync();
    this.setPhase("listening");
    void this.startCapture(session);
  }

  tapCloud(): void {
    if (!this.open) return;
    const phase = this.phaseState;
    if (phase === "listening" && this.endpointer.tap()) {
      this.endUtterance(this.session, "tap");
    } else if (
      phase === "transcribing" ||
      phase === "thinking" ||
      phase === "speaking"
    ) {
      void this.turn?.interrupt();
    }
  }

  /** The chat screen's explicit way out; the voice tab's End button. */
  exit(reason: string): Promise<void> {
    if (!this.open) {
      return this.exiting ?? Promise.resolve();
    }
    this.open = false;
    this.session += 1;
    this.micRetried = false;
    this.setPhase("closed");
    this.stopCapture();
    const turn = this.turn;
    this.turn = null;
    this.exiting = (async () => {
      try {
        if (turn) {
          await turn.interrupt();
        }
      } catch (err) {
        console.warn("[voiceMode] interrupt on exit failed:", err);
      }
      try {
        await this.deps.engine.release();
      } catch (err) {
        console.warn("[voiceMode] release failed:", err);
      }
      voiceLock.releaseScreen();
    })();
    return this.exiting;
  }

  /** Screen gone: no session, and none may start until remounted. */
  dispose(): void {
    this.disposed = true;
    this.deps.port.onReply = null;
    this.exit("dispose");
  }

  onAppStateChange(next: AppStateStatus): void {
    if (!this.open) return;
    if (next === "background") {
      this.exit("background");
    }
  }

  private notifyError(message: string): void {
    this.hooks.captions({ issue: message });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {},
    );
  }

  // -- capture ------------------------------------------------------------

  private watchMic(session: number): void {
    this.clearMicWatchdog();
    this.micWatchdog = setTimeout(() => {
      this.micWatchdog = null;
      if (session !== this.session) return;
      if (this.micRetried) {
        console.warn("[voiceMode] microphone delivered no audio");
        this.notifyError("No audio from the microphone — ended the session.");
        this.exit("mic_silent");
        return;
      }
      this.micRetried = true;
      this.stopCapture();
      void this.startCapture(session);
    }, VOICE_MIC_WATCHDOG_MS);
  }

  private async startCapture(session: number): Promise<void> {
    while (this.micStarting) {
      await this.micStarting;
    }
    const starting = this.openMic(session);
    this.micStarting = starting;
    try {
      await starting;
    } finally {
      if (this.micStarting === starting) {
        this.micStarting = null;
      }
    }
  }

  private async openMic(session: number): Promise<void> {
    if (!this.isListening(session)) return;
    await this.captureSettled;
    if (!this.isListening(session)) return;
    this.endpointer.reset();
    try {
      await this.deps.capture.start((pcm) => this.pushChunk(pcm, session));
    } catch (err) {
      console.warn("[voiceMode] microphone failed:", err);
      if (session === this.session) {
        this.notifyError("Microphone failed — tap the mic to try again.");
        this.exit("mic_failed");
      }
      return;
    }
    if (!this.isListening(session)) return;
    this.watchMic(session);
  }

  private clearMicWatchdog(): void {
    if (this.micWatchdog) {
      clearTimeout(this.micWatchdog);
      this.micWatchdog = null;
    }
  }

  private stopCapture(): void {
    this.clearMicWatchdog();
    this.endpointer.reset();
    try {
      this.deps.capture.stop();
    } catch {
      // Nothing live to stop.
    }
    this.holdMic(VOICE_CAPTURE_SETTLE_MS);
  }

  /** The next mic start waits at least `ms` from now: on Android the
   *  recorder's read thread releases the shared recorder when it ends. */
  private holdMic(ms: number): void {
    const held = new Promise<void>((resolve) => setTimeout(resolve, ms));
    this.captureSettled = Promise.all([this.captureSettled, held]).then(
      () => {},
    );
  }

  private pushChunk(pcm: Uint8Array, session: number): void {
    if (session !== this.session) return;
    this.clearMicWatchdog();
    this.micRetried = false;
    // The orb's level feed runs on every chunk; it must not be able to
    // throw into the turn path.
    try {
      this.deps.onMicAudio(int16PcmToFloat32(pcm));
    } catch {
      // A level consumer dying must never take the session down.
    }
    if (this.endpointer.push(pcm) === "endpoint") {
      this.endUtterance(session, "auto");
    }
  }

  // -- turns --------------------------------------------------------------

  private endUtterance(session: number, by: "auto" | "tap"): void {
    const utterance = this.endpointer.take();
    this.stopCapture();
    this.setPhase("transcribing");
    const current = (): boolean => session === this.session && this.open;
    const turn = this.deps.engine.runTurn(utterance, this.deps.port, {
      transcribed: (text) => {
        if (!current()) return;
        this.hooks.captions({ heard: text, reply: null });
        this.setPhase("thinking");
      },
      speechStarted: () => {
        if (!current()) return;
        this.setPhase("speaking");
      },
    });
    this.turn = turn;
    void turn.done
      .catch((): VoiceTurnOutcome => "reply_failed")
      .then((outcome) => {
        if (!current()) return;
        this.turn = null;
        this.setPhase("listening");
        if (outcome === "empty") {
          this.hooks.captions({
            heard: "",
            issue: "Didn't catch anything — try speaking again.",
          });
        } else if (outcome === "interrupted") {
          // Nothing to say; the listen simply resumes.
        } else if (outcome === "answered") {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        } else {
          const message = FAILURES[outcome];
          if (message) this.notifyError(message);
        }
        this.startCapture(session);
      });
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

const EMPTY_CAPTIONS: VoiceCaptions = {
  heard: "",
  reply: null,
  issue: null,
  needsMicSettings: false,
};

/** The default mic: audio-studio's recorder, 50 ms int16 PCM events. */
function makeDefaultCapture(recorder: ReturnType<typeof useAudioRecorder>): VoiceCapture {
  return {
    start: async (onChunk) => {
      await recorder.startRecording({
        sampleRate: ASR_SAMPLE_RATE,
        channels: 1,
        encoding: "pcm_16bit",
        interval: 50,
        onAudioStream: async (event: AudioDataEvent) => {
          // SAFETY: the recorder hands base64 int16 PCM.
          onChunk(toByteArray(event.data as string));
        },
      });
    },
    stop: () => recorder.stopRecording(),
  };
}

function resolveDeps(deps: VoiceModeDeps, recorder: ReturnType<typeof useAudioRecorder>): Required<VoiceModeDeps> {
  return {
    engine: deps.engine ?? new CascadeVoiceEngine(),
    port: deps.port ?? chatVoicePort,
    capture: deps.capture ?? makeDefaultCapture(recorder),
    isModelReady: deps.isModelReady ?? (() => {
      const s = useModelStore.getState();
      return (
        selectEngineSource({
          activeModelId: s.activeModelId,
          activeProviderType: s.activeProviderType,
          models: s.models,
          remoteApis: s.remoteApis,
        }) !== null
      );
    }),
    deviceMemory: deps.deviceMemory ?? (async () => {
      const total = await readTotalMemory();
      if (total === null) return null;
      return {
        os: Platform.OS === "ios" ? ("ios" as const) : ("android" as const),
        totalBytes: total,
      };
    }),
    chatBytes: deps.chatBytes ?? activeChatModelBytes,
    openModels: deps.openModels ?? (() => {}),
    onMicAudio: deps.onMicAudio ?? (() => {}),
  };
}

export function useVoiceMode(deps: VoiceModeDeps = {}) {
  const recorder = useAudioRecorder();
  const [phase, setPhase] = useState<VoiceModePhase>("closed");
  const [captions, setCaptions] = useState<VoiceCaptions>(EMPTY_CAPTIONS);
  const [sheet, setSheet] = useState<VoiceModeSheet>(null);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  const [controller] = useState(() => {
    return new VoiceModeController(resolveDeps(deps, recorder), {
      phase: setPhase,
      captions: (patch) => {
        setCaptions((c) => ({ ...c, ...patch }));
      },
      sheet: setSheet,
    });
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (focusedRef.current) {
        controller.onAppStateChange(next);
      }
    });
    return () => {
      sub.remove();
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    if (!focused) controller.exit("blur");
  }, [focused, controller]);

  const requestEntry = useCallback(() => controller.requestEntry(), [controller]);
  const dismissSheet = useCallback(() => setSheet(null), []);
  const setupDone = useCallback(() => controller.setupDone(), [controller]);
  const continueAnyway = useCallback(
    () => {
      if (
        sheet !== null &&
        sheet.kind === "memory" &&
        sheet.fit.status === "tight"
      ) {
        return controller.continueAnyway(sheet.fit.sttTier);
      }
    },
    [controller, sheet],
  );
  const openModels = useCallback(
    () => controller.openModelPicker(),
    [controller],
  );
  const tapCloud = useCallback(() => controller.tapCloud(), [controller]);
  const end = useCallback(() => controller.exit("end"), [controller]);

  return {
    phase,
    heard: captions.heard,
    reply: captions.reply,
    issue: captions.issue,
    needsMicSettings: captions.needsMicSettings,
    sheet,
    requestEntry,
    dismissSheet,
    setupDone,
    continueAnyway,
    openModels,
    tapCloud,
    end,
  };
}
