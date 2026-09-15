/** Hands-free voice loop: listen → send via store → speak the reply.
 *
 * The screen owns rendering (mic, overlay, captions); everything
 * stateful lives here. Each turn appends to the current chat through
 * the store's send(), so voice shares history with typed chat.
 */

import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import type { VoicePhase } from "../lib/voiceStatus.ts";
import { useChatStore } from "../store/chat.ts";

const NUDGE = "I'm listening…";
// ponytail: restart cap — a broken recognizer errors instantly, and the
// nudge-restart would hot-loop without this.
const MAX_ERROR_STREAK = 3;

export function useVoiceLoop() {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const send = useChatStore((s) => s.send);

  const phaseRef = useRef<VoicePhase>("idle");
  const aliveRef = useRef(true);
  const sentRef = useRef(false);
  const errorStreakRef = useRef(0);

  function setBoth(next: VoicePhase): void {
    phaseRef.current = next;
    setPhase(next);
  }

  // ponytail: the native modules are absent when the dev build predates
  // the dep — stop() then throws, so never let it take down the caller.
  function safeStopListen(): void {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // nothing live to stop
    }
  }

  function safeStopSpeak(): void {
    try {
      void Speech.stop();
    } catch {
      // nothing live to stop
    }
  }

  async function beginListening(): Promise<void> {
    if (!aliveRef.current) return;
    try {
      const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!aliveRef.current) return;
      if (!res.granted) {
        setIssue("Microphone access is needed.");
        setBoth("idle");
        return;
      }
      sentRef.current = false;
      errorStreakRef.current = 0;
      setHeard("");
      setIssue(null);
      setBoth("listening");
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
      });
    } catch {
      if (!aliveRef.current) return;
      setIssue("Voice input isn't available in this build — rebuild the dev client.");
      setBoth("idle");
    }
  }

  async function handleUtterance(text: string): Promise<void> {
    const said = text.trim();
    safeStopListen();
    if (!aliveRef.current) return;
    if (said === "") {
      setHeard(NUDGE);
      void beginListening();
      return;
    }
    setBoth("thinking");
    const before = useChatStore.getState().messages.length;
    const ok = await send(said);
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
    safeStopSpeak();
    setReply(text);
    setHeard("");
    setIssue(null);
    setBoth("speaking");
    try {
      Speech.speak(text, {
        language: "en-US",
        onDone: () => {
          if (aliveRef.current && phaseRef.current === "speaking") void beginListening();
        },
        onStopped: () => {
          if (aliveRef.current && phaseRef.current === "speaking") void beginListening();
        },
        onError: () => {
          if (!aliveRef.current) return;
          setIssue("Couldn't play the reply. Try again.");
          setBoth("idle");
        },
      });
    } catch {
      if (!aliveRef.current) return;
      setIssue("Voice output isn't available in this build — rebuild the dev client.");
      setBoth("idle");
    }
  }

  /** Tap the mic (or Stop): cut the audio, open the mic at once. */
  function bargeIn(): void {
    if (phaseRef.current === "thinking") return;
    if (phaseRef.current === "speaking") {
      safeStopSpeak();
      // onStopped restarts listening; fall through if it never fires.
      setTimeout(() => {
        if (aliveRef.current && phaseRef.current === "speaking") void beginListening();
      }, 500);
      return;
    }
    if (phaseRef.current === "listening") {
      safeStopListen();
      setBoth("idle");
      return;
    }
    void beginListening();
  }

  function close(): void {
    aliveRef.current = false;
    safeStopListen();
    safeStopSpeak();
    router.back();
  }

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript ?? "";
    if (text === "") return;
    errorStreakRef.current = 0;
    setHeard(text);
    if (event.isFinal && !sentRef.current) {
      sentRef.current = true;
      void handleUtterance(text);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return; // our own stop()
    if (!aliveRef.current || phaseRef.current !== "listening") return;
    if (event.error === "not-allowed") {
      setIssue("Microphone access is needed.");
      setBoth("idle");
      return;
    }
    // Silence / no-speech: nudge and keep the loop alive.
    errorStreakRef.current += 1;
    if (errorStreakRef.current >= MAX_ERROR_STREAK) {
      setIssue("Having trouble hearing you.");
      setBoth("idle");
      return;
    }
    setHeard(NUDGE);
    safeStopListen();
    void beginListening();
  });

  useEffect(() => {
    aliveRef.current = true;
    void beginListening();
    return () => {
      aliveRef.current = false;
      safeStopListen();
      safeStopSpeak();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { phase, heard, reply, issue, bargeIn, close, retry: beginListening };
}
