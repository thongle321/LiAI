/** Vision turn: voice or text question about the live camera.
 *
 * The stream sends frames while the screen is idle/listening. A question
 * snapshots the CURRENT frame at ask time and runs it through the
 * chat pipeline STORE-LESS (createVisionTurnRunner): no chat session is
 * minted or adopted, nothing is appended to the chat history — the only
 * memory is the ephemeral vision record below, cleared on exit.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Camera as VisionCameraView } from "react-native-vision-camera";
import { useIsFocused } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import type { VoicePhase } from "@/services/voice/voice-status.ts";
import {
  bargeActionFor,
  isThrottlingError,
  isVoiceThrottled,
  setVoiceThrottled,
  voiceErrorAction,
} from "@/services/voice/voice-status.ts";
import { ensureMicAccess } from "@/services/voice/mic-access.ts";
import { stopSpeaking } from "@/services/voice/voice-speak.ts";
import { VOICE_LISTEN_OPTS } from "@/services/voice/voice-listen.ts";
import { snapshotToUri } from "@/services/storage/snapshot.ts";
import {
  createVisionTurnRunner,
} from "@/store/chat/index.ts";
import { multimodalAvailable } from "@/services/inference/mmproj.ts";
import { MULTIMODAL_WARNING } from "@/store/chat/send.ts";
import {
  VISION_EPHEMERAL_ID,
  visionHistory,
  visionRecord,
  visionReset,
} from "@/services/chat/vision-session.ts";

const NOTHING_HEARD = "Didn't hear anything — tap the mic to try again.";
const NO_FRAME = "Couldn't capture a frame — try again.";

export function useVisionTurn(
  camera: RefObject<VisionCameraView | null>,
  cameraReady: () => boolean,
  /** Watch mode (05): recent buffered frames win over the at-ask
   *  snapshot when the buffer is non-empty. */
  getBufferedFrames?: () => string[],
) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [answer, setAnswer] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  // The vision tab owns its turn runner: store-less by construction.
  const runVisionTurnRef = useRef<ReturnType<typeof createVisionTurnRunner> | null>(null);
  /** Local busy flag: an in-flight vision turn refuses a new one. */
  const busyRef = useRef(false);

  const phaseRef = useRef<VoicePhase>("idle");
  const aliveRef = useRef(true);
  const sentRef = useRef(false);
  const startingRef = useRef(false);
  const errorStreakRef = useRef(0);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const cameraReadyRef = useRef(cameraReady);
  cameraReadyRef.current = cameraReady;

  function setBoth(next: VoicePhase): void {
    phaseRef.current = next;
    setPhase(next);
  }

  function safeStopListen(): void {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // nothing live to stop
    }
  }

  async function beginListening(): Promise<void> {
    if (!aliveRef.current || startingRef.current || !focusedRef.current) return;
    if (isVoiceThrottled()) {
      setNeedsSettings(false);
      setIssue("Too many voice requests — wait a bit and try again.");
      return;
    }
    if (phaseRef.current !== "idle") return;
    startingRef.current = true;
    try {
      const access = await ensureMicAccess();
      if (!aliveRef.current) return;
      if (access === "unavailable") {
        setNeedsSettings(false);
        setIssue("Voice input isn't available in this build — rebuild the dev client.");
        setBoth("idle");
        return;
      }
      if (access === "settings") {
        setNeedsSettings(true);
        setIssue("Microphone is blocked — tap here to open Settings and enable it.");
        setBoth("idle");
        return;
      }
      setNeedsSettings(false);
      sentRef.current = false;
      setAnswer("");
      setIssue(null);
      setBoth("listening");
      // Use on-device recognition only when the platform actually supports it;
      // forcing it on a device without the speech pack fails every start and
      // surfaces as "Didn't hear anything…". Fall back to network recognition
      // if the on-device start throws.
      const opts = {
        ...VOICE_LISTEN_OPTS,
        requiresOnDeviceRecognition:
          ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      };
      try {
        ExpoSpeechRecognitionModule.start(opts);
      } catch {
        ExpoSpeechRecognitionModule.start({
          ...VOICE_LISTEN_OPTS,
          requiresOnDeviceRecognition: false,
        });
      }
    } catch {
      if (!aliveRef.current) return;
      setIssue("Voice input isn't available in this build — rebuild the dev client.");
      setBoth("idle");
    } finally {
      startingRef.current = false;
    }
  }

  function retry(): void {
    if (isVoiceThrottled()) return;
    errorStreakRef.current = 0;
    void beginListening();
  }

  function handleRecognitionFailure(code: string): void {
    console.warn(`[vision] recognition failure: ${code}`);
    if (isThrottlingError(code)) setVoiceThrottled();
    const action = voiceErrorAction(errorStreakRef.current, code);
    errorStreakRef.current += 1;
    if (action.fatal) {
      setIssue(action.message);
      setBoth("idle");
      return;
    }
    setIssue(NOTHING_HEARD);
    safeStopListen();
    setBoth("idle");
  }

  /** Capture the current frame and answer it on-device (ADR-0008). */
  async function askAboutFrame(text: string): Promise<void> {
    const said = text.trim();
    if (said === "" || !aliveRef.current) {
      setBoth("idle");
      return;
    }
    setBoth("thinking");
    setIssue(null);

    const buffered = getBufferedFrames?.() ?? [];
    let frameUris: string[];
    if (buffered.length > 0) {
      // Watch mode: the question rides the recent-frames window, so
      // "what just moved?" has the frames to answer with.
      frameUris = buffered;
    } else {
      let frameUri: string | null = null;
      try {
        const cam = camera.current;
        if (cam !== null && cameraReadyRef.current()) {
          frameUri = await snapshotToUri(() => cam.takeSnapshot({ quality: 50 }));
        }
      } catch {
        frameUri = null;
      }
      if (!aliveRef.current) return;
      if (frameUri === null) {
        setIssue(NO_FRAME);
        setBoth("idle");
        return;
      }
      frameUris = [frameUri];
    }

    // Only one vision turn at a time (the store's busy gate lives in
    // the chat screen; this mode runs store-less, so it guards itself).
    if (busyRef.current) {
      setIssue("Still answering — hold on.");
      setBoth("idle");
      return;
    }
    busyRef.current = true;
    try {
      const runTurn =
        runVisionTurnRef.current ??
        (runVisionTurnRef.current = createVisionTurnRunner());
      const outcome = await runTurn(said, {
        sessionId: VISION_EPHEMERAL_ID,
        history: visionHistory(),
        images: frameUris,
        voiceMode: true,
      });
      if (!aliveRef.current) return;
      visionRecord(said, outcome.reply);
      showAnswer(outcome.reply);
    } catch {
      // The store-backed send surfaced richer errors; the store-less
      // runner only rejects when the engine is unusable, and the strip
      // has no action to offer beyond a retry.
      if (!aliveRef.current) return;
      setIssue("Couldn't answer that. Try again.");
      setBoth("idle");
      return;
    } finally {
      busyRef.current = false;
    }
    // The frame went out with the turn — if the model could not actually
    // SEE it, say so HERE on the vision screen (the chat screen's
    // chatWarning never reaches this tab). Reads the send path's own
    // gate, so the strip and this notice can never disagree (and the
    // notice silences itself when vision becomes real).
    if (!(await multimodalAvailable())) {
      setIssue(MULTIMODAL_WARNING);
    }
  }

  function showAnswer(text: string): void {
    if (!aliveRef.current) return;
    // Vision mode answers in the caption only - no TTS.
    stopSpeaking();
    setAnswer(text);
    setIssue(null);
    setBoth("idle");
  }

  /** Mic tap: begin from idle, stop back to idle — never auto-listen. */
  function bargeIn(): void {
    switch (bargeActionFor(phaseRef.current)) {
      case "begin":
        void beginListening();
        return;
      case "stop":
        safeStopListen();
        setBoth("idle");
        return;
      case "ignore":
        return;
      case "interrupt":
        stopSpeaking();
        setBoth("idle");
        return;
    }
  }

  /** Text send: same frame + question turn, no recognizer involved. */
  function sendText(text: string): void {
    if (phaseRef.current !== "idle" || isVoiceThrottled()) {
      if (isVoiceThrottled()) {
        setNeedsSettings(false);
        setIssue("Too many voice requests — wait a bit and try again.");
      }
      return;
    }
    setAnswer("");
    void askAboutFrame(text);
  }

  /** Stop everything (screen exit): recognizer, speech, back to idle.
   *  The exit is the vision conversation whole life, so the ephemeral
   *  memory dies here too — the next entry starts with no history. */
  function stopAll(): void {
    safeStopListen();
    stopSpeaking();
    visionReset();
    setBoth("idle");
  }

  useSpeechRecognitionEvent("result", (event) => {
    if (!focusedRef.current) return;
    const text = event.results[0]?.transcript ?? "";
    if (text === "") return;
    errorStreakRef.current = 0;
    if (event.isFinal && !sentRef.current) {
      sentRef.current = true;
      safeStopListen();
      void askAboutFrame(text);
    }
  });
  useSpeechRecognitionEvent("nomatch", () => {
    if (!focusedRef.current) return;
    if (!aliveRef.current || phaseRef.current !== "listening") return;
    handleRecognitionFailure("nomatch");
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return;
    if (!focusedRef.current) return;
    if (!aliveRef.current || phaseRef.current !== "listening") return;
    handleRecognitionFailure(event.error);
  });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      safeStopListen();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase,
    answer,
    issue,
    needsSettings,
    bargeIn,
    retry,
    sendText,
    stopAll,
  };
}
