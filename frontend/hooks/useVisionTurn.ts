/** Vision turn: voice or text question about one camera frame.
 *
 * Same discipline as the voice tab (throttle lockout, focus guards,
 * no auto-listen), plus the frame rule: exactly one snapshot per
 * send, taken at send-time. While the AI thinks and answers, the
 * preview stays live but nothing captures again — the turn reuses
 * that last frame. Next send snaps fresh; back to normal after.
 *
 * The screen owns the Camera ref and injects `snap`; everything
 * stateful lives here. Answers persist through the chat store, so
 * every exchange also lands in chat history.
 */

import { useEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import type { VoicePhase } from "../lib/voiceStatus.ts";
import { bargeActionFor, isThrottlingError, isVoiceThrottled, setVoiceThrottled, voiceErrorAction } from "../lib/voiceStatus.ts";
import { ensureMicAccess } from "../lib/micAccess.ts";
import { speakReply, stopSpeaking } from "../lib/voiceSpeak.ts";
import { VOICE_LISTEN_OPTS } from "../lib/voiceListen.ts";
import { useChatStore } from "../store/chat.ts";

const NOTHING_HEARD = "Didn't hear anything — tap the mic to try again.";
const NO_FRAME = "Couldn't capture a frame — try again.";

/** Returns the frame as a data-uri, or null when the camera isn't ready. */
export type SnapFrame = () => Promise<string | null>;

export function useVisionTurn(snap: SnapFrame) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [answer, setAnswer] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const send = useChatStore((s) => s.send);

  const phaseRef = useRef<VoicePhase>("idle");
  const aliveRef = useRef(true);
  const sentRef = useRef(false);
  const startingRef = useRef(false);
  const errorStreakRef = useRef(0);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const snapRef = useRef(snap);
  snapRef.current = snap;

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
    if (isThrottlingError(code)) {
      setVoiceThrottled();
    }
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

  /** One frame, one send: the turn's only capture. */
  async function askAboutFrame(text: string): Promise<void> {
    const said = text.trim();
    if (said === "" || !aliveRef.current) {
      setBoth("idle");
      return;
    }
    setBoth("thinking");
    setIssue(null);
    let frame: string | null = null;
    try {
      frame = await snapRef.current();
    } catch {
      frame = null;
    }
    if (!aliveRef.current) return;
    if (frame === null) {
      setIssue(NO_FRAME);
      setBoth("idle");
      return;
    }
    // A typed send may still be in flight (store.send refuses while
    // busy): wait for it instead of failing the turn.
    let waited = 0;
    while (useChatStore.getState().sending && waited < 10 && aliveRef.current) {
      await new Promise((r) => setTimeout(r, 1000));
      waited += 1;
    }
    const before = useChatStore.getState().messages.length;
    const ok = await send(said, frame);
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
  }

  function speak(text: string): void {
    if (!aliveRef.current) return;
    stopSpeaking();
    setAnswer(text);
    setIssue(null);
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

  /** Text send: same single-frame turn, no recognizer involved. */
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

  return { phase, answer, issue, needsSettings, bargeIn, retry, sendText, stopAll };
}
