/** Hands-free voice loop: listen → send via store → speak the reply.
 *
 * The screen owns rendering (mic, overlay, captions); everything
 * stateful lives here. Each turn appends to the current chat through
 * the store's send(), so voice shares history with typed chat.
 */

import { useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import type { VoicePhase } from "../lib/voiceStatus.ts";
import { bargeActionFor, voiceErrorAction } from "../lib/voiceStatus.ts";
import { VOICE_LISTEN_OPTS } from "../lib/voiceListen.ts";
import { useChatStore } from "../store/chat.ts";

const NUDGE = "I'm listening…";

export function useVoiceLoop() {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const send = useChatStore((s) => s.send);

  const phaseRef = useRef<VoicePhase>("idle");
  const aliveRef = useRef(true);
  const sentRef = useRef(false);
  // Consecutive failures without any transcript; reset by a result or
  // an explicit user retry — never by a restart, or a deaf recognizer
  // would nudge forever instead of saying what's wrong.
  const errorStreakRef = useRef(0);
  // Guards overlapping beginListening calls (double-mount, fast
  // restarts): a second start() while busy errors the session.
  const startingRef = useRef(false);
  // Set when the user cuts the audio: the stop callback then stays quiet
  // because bargeIn already restarted listening itself.
  const bargedRef = useRef(false);

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
    if (!aliveRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!aliveRef.current) return;
      if (!res.granted) {
        setIssue("Microphone access is needed.");
        setBoth("idle");
        return;
      }
      sentRef.current = false;
      setHeard("");
      setIssue(null);
      setBoth("listening");
      ExpoSpeechRecognitionModule.start({
        ...VOICE_LISTEN_OPTS,
      });
    } catch {
      if (!aliveRef.current) return;
      setIssue("Voice input isn't available in this build — rebuild the dev client.");
      setBoth("idle");
    } finally {
      startingRef.current = false;
    }
  }

  /** Explicit user retry: fresh streak, fresh listen. */
  function retry(): void {
    errorStreakRef.current = 0;
    void beginListening();
  }

  /** One shared failure path for error + nomatch events. */
  function handleRecognitionFailure(code: string): void {
    // Permanent: shows in the Expo terminal AND names the code on
    // screen at the streak cap, so a deaf recognizer can't fail
    // silently anymore.
    console.warn(`[voice] recognition failure: ${code}`);
    const action = voiceErrorAction(errorStreakRef.current, code);
    errorStreakRef.current += 1;
    if (action.fatal) {
      setIssue(action.message);
      setBoth("idle");
      return;
    }
    setHeard(NUDGE);
    safeStopListen();
    // Breathing room: instant restarts hammer start() and Android
    // answers ERROR_TOO_MANY_REQUESTS. One calm retry after 2s.
    setTimeout(() => {
      if (aliveRef.current && phaseRef.current === "listening") void beginListening();
    }, 2000);
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
    // A typed send may still be in flight (store.send refuses while
    // busy): wait for it instead of failing the turn and the loop.
    let waited = 0;
    while (useChatStore.getState().sending && waited < 10 && aliveRef.current) {
      await new Promise((r) => setTimeout(r, 1000));
      waited += 1;
    }
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
    bargedRef.current = false;
    safeStopSpeak();
    setReply(text);
    setHeard("");
    setIssue(null);
    setBoth("speaking");
    try {
      Speech.speak(text, {
        language: "en-US",
        onDone: () => {
          if (bargedRef.current || !aliveRef.current || phaseRef.current !== "speaking") return;
          void beginListening();
        },
        onStopped: () => {
          if (bargedRef.current) {
            bargedRef.current = false;
            return;
          }
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
    switch (bargeActionFor(phaseRef.current)) {
      case "begin":
        void beginListening();
        return;
      case "restart":
        // Fresh listen, not idle: taps never kill the hands-free loop.
        safeStopListen();
        void beginListening();
        return;
      case "ignore":
        return; // request in flight, nothing to cut yet
      case "interrupt":
        bargedRef.current = true;
        safeStopSpeak();
        setBoth("listening");
        void beginListening();
        return;
    }
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
  useSpeechRecognitionEvent("nomatch", () => {
    // Final result with nothing recognizable: same path as a failure.
    if (!aliveRef.current || phaseRef.current !== "listening") return;
    handleRecognitionFailure("nomatch");
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return; // our own stop()
    if (!aliveRef.current || phaseRef.current !== "listening") return;
    handleRecognitionFailure(event.error);
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

  return { phase, heard, reply, issue, bargeIn, retry };
}
