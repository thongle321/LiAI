/** Vision turn: voice or text question about the live camera.
 *
 * The stream sends frames while the screen is idle/listening. A question
 * pauses frame uploads, sends the current frame plus question over the
 * vision socket, and resumes after the answer and TTS finish. If the socket
 * is unavailable, the existing HTTP chat path remains the fallback so a
 * network hiccup does not make vision unusable.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Camera as VisionCameraView } from "react-native-vision-camera";
import { useIsFocused } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import type { VoicePhase } from "../lib/voiceStatus.ts";
import {
  bargeActionFor,
  isThrottlingError,
  isVoiceThrottled,
  setVoiceThrottled,
  voiceErrorAction,
} from "../lib/voiceStatus.ts";
import { ensureMicAccess } from "../lib/micAccess.ts";
import { speakReply, stopSpeaking } from "../lib/voiceSpeak.ts";
import { useVoice } from "../store/voice.ts";
import { VOICE_LISTEN_OPTS } from "../lib/voiceListen.ts";
import { snapshotToBase64 } from "../lib/snapshot.ts";
import { useChatStore } from "../store/chat.ts";
import { multimodalAvailable, MULTIMODAL_WARNING } from "../store/chat/send.ts";

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
  const send = useChatStore((s) => s.send);
  const sending = useChatStore((s) => s.sending);

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
      ExpoSpeechRecognitionModule.start({ ...VOICE_LISTEN_OPTS });
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
    let dataUris: string[];
    if (buffered.length > 0) {
      // Watch mode: the question rides the recent-frames window, so
      // "what just moved?" has the frames to answer with.
      dataUris = buffered;
    } else {
      let rawJpeg: string | null = null;
      try {
        const cam = camera.current;
        if (cam !== null && cameraReadyRef.current()) {
          rawJpeg = await snapshotToBase64(() => cam.takeSnapshot({ quality: 50 }));
        }
      } catch {
        rawJpeg = null;
      }
      if (!aliveRef.current) return;
      if (rawJpeg === null) {
        setIssue(NO_FRAME);
        setBoth("idle");
        return;
      }
      dataUris = [`data:image/jpeg;base64,${rawJpeg}`];
    }

    // A chat send may still be in flight (store.send refuses while busy):
    // wait for it instead of failing the turn.
    let waited = 0;
    while (useChatStore.getState().sending && waited < 10 && aliveRef.current) {
      await new Promise((r) => setTimeout(r, 1000));
      waited += 1;
    }
    const before = useChatStore.getState().messages.length;
    const ok = await send(said, dataUris);
    if (!aliveRef.current) return;
    if (!ok) {
      setIssue("Couldn't send that. Try again.");
      setBoth("idle");
      return;
    }
    const replyMsg = useChatStore
      .getState()
      .messages.slice(before)
      .find((m) => m.role === "assistant");
    if (replyMsg === undefined) {
      setIssue("No reply came back. Try again.");
      setBoth("idle");
      return;
    }
    speak(replyMsg.text);
    // The frame went out with the turn — if the model could not actually
    // SEE it, say so HERE on the vision screen (the chat screen's
    // chatWarning never reaches this tab). Reads the send path's own
    // gate, so the strip and this notice can never disagree (and the
    // notice silences itself when vision becomes real).
    if (!(await multimodalAvailable())) {
      setIssue(MULTIMODAL_WARNING);
    }
  }

  function speak(text: string): void {
    if (!aliveRef.current) return;
    stopSpeaking();
    setAnswer(text);
    setIssue(null);
    if (!useVoice.getState().autoSpeak) {
      setBoth("idle");
      return;
    }
    setBoth("speaking");
    speakReply(text, {
      onDone: () => {
        if (aliveRef.current && phaseRef.current === "speaking") setBoth("idle");
      },
      onStopped: () => {
        if (aliveRef.current && phaseRef.current === "speaking") setBoth("idle");
      },
      onError: () => {
        if (!aliveRef.current) return;
        setIssue("Couldn't play the reply. Try again.");
        setBoth("idle");
      },
    });
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

  /** Stop everything (screen exit): recognizer, speech, back to idle. */
  function stopAll(): void {
    safeStopListen();
    stopSpeaking();
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
