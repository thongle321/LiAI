/** One hands-free voice session, ported from PocketPal's useVoiceMode
 *  controller (#1007/#1017) onto LiAI's stack: Whisper STT (Endpointer)
 *  + the cascade engine, through the same chat store send path as typed
 *  chat.
 *
 *  Recorded divergences (docs/specs/2026-10-25-voice-unified-whisper.md and
 *  2026-10-27-voice-tab-hands-free-parity.md): no Plus teaser/paywall, no
 *  device gate, no voice-picker setup step, and speech interruption support
 *  rides the fork's own events rather than a speech-capture interrupt hook.
 *  Mic mute, audio-interruption pause/resume and per-turn speech_failed are
 *  ported (voice-tab hands-free parity spec).
 *
 *  Session state is a STORE, not controller React state (spec: hands-free
 *  in chat / issue 01): phase, mic mute, full/bar presentation, the origin
 *  screen and the captions live in store/voice-mode.ts. The controller
 *  remains the only writer. The hook is mounted EXACTLY ONCE at the tab
 *  layout level (components/voice/voice-session-host.tsx) so the chat
 *  screen and the Voice tab can never run two sessions; screens consume
 *  the registered controller through useVoiceSession(origin), whose blur
 *  guard re-anchors exit-on-blur to the screen that started the session.
 *
 *  The hook is the only consumer interface; the class is internal. The
 *  deps options are seams for tests and let the screen pass navigation.
 */

import { useCallback, useEffect, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { useIsFocused } from "expo-router";
import * as Haptics from "expo-haptics";
import { toByteArray } from "base64-js";
import { useAudioRecorder, type AudioDataEvent } from "@siteed/audio-studio";
import {
  onAudioInterruption,
  type AudioInterruptionProps,
} from "@pocketpalai/react-native-speech";

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
import { TTS_ENGINE_RUNTIME_BYTES } from "@/services/tts/constants.ts";
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
import {
  voiceModeSessionApi,
  useVoiceModeSession,
  type VoiceModeCircuit,
  type VoiceModePresentation,
  type VoiceModeSessionApi,
  type VoiceModeSheet,
  type VoiceSessionOrigin,
} from "@/store/voice-mode.ts";

export type { VoiceModeSheet, VoiceSessionOrigin } from "@/store/voice-mode.ts";

/** A distinct tag: ending a chat turn's wake lock must not cut a live
 *  voice session (each holder keeps its own lock). */
const voiceLock = createKeepAwake(
  () => import("expo-keep-awake"),
  "liai-voice-mode",
);

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

const FAILURES: Partial<Record<VoiceTurnOutcome, string>> = {
  transcribe_failed: "Couldn't transcribe that. Try speaking again.",
  reply_failed: "Couldn't send that. Try again.",
  speech_failed: "Couldn't play the answer aloud.",
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
  private exiting: Promise<void> | null = null;
  private turn: VoiceTurn | null = null;
  /** True between an audio interruption's `began` and its resume: the
   *  controller-internal half of the pause (the UI rides micMuted). */
  private pausedByInterruption = false;
  private readonly endpointer = new Endpointer();
  private micWatchdog: ReturnType<typeof setTimeout> | null = null;
  private micRetried = false;
  private captureSettled: Promise<void> = Promise.resolve();
  private micStarting: Promise<void> | null = null;

  constructor(
    private readonly deps: Required<VoiceModeDeps>,
    /** The circuit store — injected so tests can pin the write lane; the
     *  app binds the real one in store/voice-mode.ts. */
    private readonly sessionStore: VoiceModeSessionApi = voiceModeSessionApi,
  ) {
    // The reply caption lands as soon as the run settles — usually while
    // the speech is still going; the phase flips via the engine's
    // speechStarted event.
    this.deps.port.onReply = (text) => {
      if (this.open) this.writeCircuit({ reply: text });
    };
  }

  /** The circuit's current phase, read from the store (the controller is
   *  its only writer, so this is safe to read without subscribing). */
  private get phaseState(): VoiceModePhase {
    return this.sessionStore.get().phase;
  }

  private writeCircuit(patch: Partial<VoiceModeCircuit>): void {
    this.sessionStore.set(patch);
  }

  async requestEntry(origin: VoiceSessionOrigin = "voice"): Promise<void> {
    if (this.open || this.disposed) return;
    // The exit-on-blur anchor: remember WHOSE screen asked, even when a
    // gate fails (a parked sheet belongs to the originating screen).
    this.writeCircuit({ origin });
    if (!this.deps.isModelReady()) {
      this.writeCircuit({
        issue: "Load a chat model first — pick one in Models.",
        sheet: null,
      });
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
      this.writeCircuit({
        needsMicSettings: true,
        issue: "Microphone is blocked — enable it in Settings.",
      });
      return;
    }
    if (mic === "unavailable") {
      this.writeCircuit({
        needsMicSettings: false,
        issue: "Voice isn't available in this build — rebuild the dev client.",
      });
      return;
    }
    // The setup gate: tier ready AND mic already granted. Everything else
    // is what VoiceSetupSheet exists to fix (tier download and/or the ask).
    if (!asrStore.isSelectedTierReady || mic !== "granted") {
      this.writeCircuit({ sheet: { kind: "setup" } });
      return;
    }
    await this.checkMemoryAndEnter();
  }

  async checkMemoryAndEnter(): Promise<void> {
    await this.exiting;
    if (this.open || this.disposed) {
      this.writeCircuit({ sheet: null });
      return;
    }
    if (!asrStore.isSelectedTierReady) {
      this.writeCircuit({ sheet: { kind: "setup" } });
      return;
    }
    const tier = asrStore.selectedTier;
    // The selected TTS voice's measured runtime bytes (PocketPal's
    // TTS_ENGINE_RUNTIME_BYTES table); the system voice has none (0 row,
    // omitted from the breakdown). Replaces item 1's placeholder.
    const voice = useVoice.getState().currentVoice;
    const ttsBytes =
      voice !== null && voice.engine !== "system"
        ? TTS_ENGINE_RUNTIME_BYTES[voice.engine]
        : 0;
    const fit = voiceMemoryFit({
      memory: await this.deps.deviceMemory(),
      chatBytes: await this.deps.chatBytes(),
      sttTier: tier,
      ttsBytes,
    });
    if (fit.status === "fits") {
      this.writeCircuit({ sheet: null });
      await this.enter(tier);
    } else {
      this.writeCircuit({ sheet: { kind: "memory", fit } });
    }
  }

  /** Enters with the tier the memory sheet counted, or re-runs entry if
   *  it changed underneath (the reference's continueAnyway contract). */
  async continueAnyway(tier: AsrTier): Promise<void> {
    await this.exiting;
    this.writeCircuit({ sheet: null });
    if (this.open || this.disposed) return;
    if (asrStore.selectedTier !== tier || !asrStore.isSelectedTierReady) {
      await this.requestEntry();
      return;
    }
    await this.enter(tier);
  }

  /** The memory sheet's way into the picker (a smaller chat model). */
  openModelPicker(): void {
    this.writeCircuit({ sheet: null });
    this.deps.openModels();
  }

  setupDone(): Promise<void> {
    this.writeCircuit({ sheet: null });
    return this.requestEntry(this.sessionStore.get().origin ?? "voice");
  }

  private setPhase(phase: VoiceModePhase): void {
    this.writeCircuit({ phase });
  }

  /** Presenter writers for the session's two presentations (the
   *  reference's setPresentation): the collapsed bar lives inside the
   *  Voice tab, not over the chat — the session, its mic and its turns
   *  keep running across the swap. Only a live session has a shape. */
  collapse(): void {
    if (this.open) this.writeCircuit({ presentation: "bar" });
  }

  expand(): void {
    if (this.open) this.writeCircuit({ presentation: "full" });
  }

  /** The UI putting a parked gate sheet away; a session-circuit write like
   *  any other, so it stays this class's lane. */
  dismissSheet(): void {
    this.writeCircuit({ sheet: null });
  }

  /** True only when the capture may actually run: the session must be the
   *  live one, listening, and not muted. */
  private isListening(session: number): boolean {
    return (
      session === this.session &&
      this.open &&
      this.phaseState === "listening" &&
      !this.sessionStore.get().micMuted
    );
  }

  private async enter(tier: AsrTier): Promise<void> {
    await this.exiting;
    if (this.open || this.disposed) return;
    this.open = true;
    const session = ++this.session;
    this.setPhase("starting");
    // Every open presents full-screen; a stale `bar` from a previous
    // session must not survive a fresh one. (Mute is reset in exit.)
    this.writeCircuit({ presentation: "full" });
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
    this.writeCircuit({
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
    // A paused session comes back on the cloud like it does on `ended`.
    if (this.pausedByInterruption) {
      this.resumeAfterInterruption();
      return;
    }
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

  /** The mute switch: flip the flag, then act only while listening. A
   *  muted mic never restarts even when a turn resumes the listen —
   *  isListening includes the flag — and unmute re-opens the capture with
   *  a fresh watchdog retry budget (reference toggleMute). */
  toggleMute(): void {
    if (!this.open) return;
    const muted = !this.sessionStore.get().micMuted;
    this.writeCircuit({ micMuted: muted });
    // An explicit mute/unmute is a user decision: it ends any pause, and
    // unmute below becomes the resume (reference toggleMute).
    this.pausedByInterruption = false;
    if (this.phaseState !== "listening") return;
    if (muted) {
      this.stopCapture();
    } else {
      this.micRetried = false;
      void this.startCapture(this.session);
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
    this.pausedByInterruption = false;
    this.setPhase("closed");
    // Closing the circuit resets what belongs to a session: the mute
    // flag dies with it, and the next open presents full again.
    this.writeCircuit({ micMuted: false, presentation: "full" });
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

  /** A call, alarm or Siri took the audio session: the mic and any turn
   *  stop and the UI shows the mic off until `ended` (or a cloud tap, or
   *  the app returning to active) resumes unmuted. `ended` may never
   *  arrive (Android only holds focus while a chunk plays; iOS skips it
   *  after Siri), and no watchdog runs meanwhile — the capture is off.
   *  (Reference onAudioInterruption; the UI pause state rides the
   *  existing micMuted flag.) */
  onAudioInterruption({ type }: AudioInterruptionProps): void {
    if (!this.open) return;
    if (type === "began") {
      this.stopCapture();
      if (this.turn) {
        void this.turn.interrupt();
      }
      if (
        (this.turn !== null ||
          this.phaseState === "listening" ||
          this.phaseState === "starting") &&
        !this.sessionStore.get().micMuted
      ) {
        this.pausedByInterruption = true;
        this.writeCircuit({ micMuted: true });
      }
      return;
    }
    if (this.pausedByInterruption) {
      this.resumeAfterInterruption();
    } else if (this.phaseState === "listening") {
      // Not one of ours: a plain capture restart on the live listen.
      this.stopCapture();
      void this.startCapture(this.session);
    }
  }

  /** The one way a paused session comes back: unmuted, fresh watchdog
   *  budget, capture re-opened. Shared by `ended`, the cloud tap and the
   *  app returning to active (reference resumeAfterInterruption). */
  private resumeAfterInterruption(): void {
    this.pausedByInterruption = false;
    this.micRetried = false;
    this.writeCircuit({ micMuted: false });
    this.stopCapture();
    void this.startCapture(this.session);
  }

  onAppStateChange(
    previous: AppStateStatus | null,
    next: AppStateStatus,
  ): void {
    if (!this.open) return;
    if (next === "background") {
      this.exit("background");
    } else if (next === "active" && previous === "inactive") {
      if (this.pausedByInterruption) {
        this.resumeAfterInterruption();
      } else if (this.phaseState === "listening") {
        // iOS laid the capture down with the audio session (reference
        // mic.restart, why: foreground): re-open on the way back.
        this.stopCapture();
        void this.startCapture(this.session);
      }
    }
  }

  private notifyError(message: string): void {
    this.writeCircuit({ issue: message });
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
        this.writeCircuit({ heard: text, reply: null });
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
          this.writeCircuit({
            heard: "",
            issue: "Didn't catch anything — try speaking again.",
          });
        } else if (outcome === "interrupted") {
          // Nothing to say; the listen simply resumes.
        } else if (outcome === "answered") {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        } else if (outcome === "reply_failed") {
          const reason = this.deps.engine.lastReplyError;
          this.notifyError(
            reason
              ? `Couldn't send that: ${reason}. Try again.`
              : "Couldn't send that. Try again.",
          );
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

/** The UI side of the mic-level bridge: the controller is mounted once at
 *  the tab layout, but the orb's SharedValues live on the screen that
 *  renders the orb. The screen hands its setSamples here; the controller's
 *  default onMicAudio forwards every chunk to whoever is registered. */
let micSink: ((pcm: Float32Array) => void) | null = null;

export function setVoiceMicSink(
  sink: (pcm: Float32Array) => void,
): () => void {
  micSink = sink;
  return () => {
    if (micSink === sink) micSink = null;
  };
}

/** The single live session's controller. Consumers (useVoiceSession) call
 *  it; only one exists because the host hook is mounted exactly once. */
let activeController: VoiceModeController | null = null;

export function activeVoiceModeController(): VoiceModeController | null {
  return activeController;
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
    onMicAudio:
      deps.onMicAudio ??
      ((pcm: Float32Array) => {
        try {
          micSink?.(pcm);
        } catch {
          // A level consumer dying must never take the session down.
        }
      }),
  };
}

/** The circuit + controller-bound actions a screen (or the controller
 *  suite) works with. Reads the store; every write goes on the wrapped
 *  VoiceModeController, never direct setState. */
export interface VoiceModeSurface {
  phase: VoiceModePhase;
  micMuted: boolean;
  presentation: VoiceModePresentation;
  origin: VoiceSessionOrigin | null;
  heard: string;
  reply: string | null;
  issue: string | null;
  needsMicSettings: boolean;
  sheet: VoiceModeSheet;
  /** Starts the entry gates from `origin`'s screen (default: voice tab). */
  requestEntry(origin?: VoiceSessionOrigin): Promise<void>;
  dismissSheet(): void;
  setupDone(): Promise<void>;
  continueAnyway(): Promise<void>;
  openModels(): void;
  tapCloud(): void;
  /** The session's mic-mute switch (reference toggleMute). */
  toggleMute(): void;
  /** Collapses the full view to the in-tab bar and back (issue 04). */
  collapse(): void;
  expand(): void;
  end(): Promise<void>;
}

/** Shared body of both entry points: read the circuit, wrap the
 *  controller's actions. */
function useVoiceSurface(): VoiceModeSurface {
  const circuit = useVoiceModeSession();
  const requestEntry = useCallback(
    (origin: VoiceSessionOrigin = "voice") =>
      // A live session makes a second entry a no-op: one controller runs
      // the only loop for both surfaces.
      activeController?.requestEntry(origin) ?? Promise.resolve(),
    [],
  );
  const dismissSheet = useCallback(
    () => activeController?.dismissSheet(),
    [],
  );
  const setupDone = useCallback(
    () => activeController?.setupDone() ?? Promise.resolve(),
    [],
  );
  const continueAnyway = useCallback(() => {
    // The tier comes from the circuit's own memory sheet, at call time.
    const sheet = voiceModeSessionApi.get().sheet;
    if (
      sheet !== null &&
      sheet.kind === "memory" &&
      sheet.fit.status === "tight"
    ) {
      void activeController?.continueAnyway(sheet.fit.sttTier);
    }
    return Promise.resolve();
  }, []);
  const openModels = useCallback(
    () => activeController?.openModelPicker(),
    [],
  );
  const tapCloud = useCallback(() => activeController?.tapCloud(), []);
  const toggleMute = useCallback(() => activeController?.toggleMute(), []);
  const collapse = useCallback(() => activeController?.collapse(), []);
  const expand = useCallback(() => activeController?.expand(), []);
  const end = useCallback(
    () => activeController?.exit("end") ?? Promise.resolve(),
    [],
  );
  return {
    ...circuit,
    requestEntry,
    dismissSheet,
    setupDone,
    continueAnyway,
    openModels,
    tapCloud,
    toggleMute,
    collapse,
    expand,
    end,
  };
}

/** The HOST hook: mounted exactly once, at the tab-layout level, by
 *  components/voice/voice-session-host.tsx. Creates the single controller
 *  and wires app-state exits. Blur exits do NOT live here — they are
 *  re-anchored to the session's ORIGIN screen by that screen's
 *  useVoiceSession guard (a session survives a tab that didn't start it). */
export function useVoiceMode(deps: VoiceModeDeps = {}): VoiceModeSurface {
  const recorder = useAudioRecorder();
  const [controller] = useState(() => {
    const created = new VoiceModeController(resolveDeps(deps, recorder));
    activeController = created;
    return created;
  });

  useEffect(() => {
    let previous: AppStateStatus | null = AppState.currentState;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const from = previous;
      previous = next;
      controller.onAppStateChange(from, next);
    });
    // OS-level audio interruptions (a call, an alarm) ride the fork's
    // event: the controller pauses, resumes unmuted on the way back.
    const interruptions = onAudioInterruption((event) =>
      controller.onAudioInterruption(event),
    );
    return () => {
      sub.remove();
      interruptions.remove();
      controller.dispose();
      if (activeController === controller) activeController = null;
    };
  }, [controller]);

  return useVoiceSurface();
}

/** The consumer hook: HOW a screen talks to the one session. `origin`
 *  names the screen mounting it; its blur guard exits only a session this
 *  screen started (issue 01: exit-on-blur re-anchored to the origin
 *  screen — today every live session still starts from the Voice tab). */
export function useVoiceSession(
  origin: VoiceSessionOrigin = "voice",
): VoiceModeSurface {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    return () => {
      // Focus lost: end a session this screen started; leave one that
      // belongs to another screen alone.
      const controller = activeController;
      if (
        controller !== null &&
        voiceModeSessionApi.get().origin === origin
      ) {
        void controller.exit("blur");
      }
    };
  }, [focused, origin]);
  return useVoiceSurface();
}
