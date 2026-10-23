/** Tap-to-talk voice: the mic only listens after a tap — on open,
 * after a reply, after a failure. Every turn appends to the current
 * chat through the store's send(), so voice shares history with
 * typed chat. Screen owns rendering; everything stateful lives here.
 */

import { useEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Haptics from "expo-haptics";

import type { VoicePhase } from "@/services/voice/voice-status.ts";
import { bargeActionFor, isThrottlingError, isVoiceThrottled, setVoiceThrottled, voiceErrorAction } from "@/services/voice/voice-status.ts";
import { ensureMicAccess } from "@/services/voice/mic-access.ts";
import { speakReply, stopSpeaking } from "@/services/voice/voice-speak.ts";
import { useVoice } from "@/store/voice.ts";
import { VOICE_LISTEN_OPTS } from "@/services/voice/voice-listen.ts";
import { useChatStore } from "@/store/chat.ts";

const NOTHING_HEARD = "Didn't hear anything — tap the mic to try again.";

export function useVoiceLoop() {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [heard, setHeard] = useState("");
  const heardRef = useRef("");
  const [reply, setReply] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  // Permanent denial never pops the OS dialog again — the issue
  // line becomes a link into Settings instead of dead text.
  const [needsSettings, setNeedsSettings] = useState(false);
  // Hands-free: after a reply finishes, listening restarts on its own.
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeRef = useRef(false);
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
  // Auto-finalize a turn after a pause, so a slow-to-finalize
  // recognizer (or a user who stops talking) doesn't hang on "Listening".
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The stack keeps chat mounted under /voice: ignore recognizer
  // events while unfocused, or both screens process every event.
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  function setBoth(next: VoicePhase): void {
    phaseRef.current = next;
    setPhase(next);
  }

  function clearSilenceTimer(): void {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function resetSilenceTimer(): void {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (!aliveRef.current || !focusedRef.current) return;
      if (phaseRef.current !== "listening") return;
      clearSilenceTimer();
      const text = heardRef.current.trim();
      if (text === "") {
        handleRecognitionFailure("nomatch");
      } else if (!sentRef.current) {
        sentRef.current = true;
        void handleUtterance(text);
      }
    }, 1200);
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

  async function beginListening(auto = false): Promise<void> {
    if (!aliveRef.current || startingRef.current || !focusedRef.current) return;
    // Shared lockout + never start while a turn is live: both extend bans.
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
      if (!auto) {
        handsFreeRef.current = true;
        setHandsFree(true);
      }
      sentRef.current = false;
      heardRef.current = "";
      setHeard("");
      setIssue(null);
      setBoth("listening");
      resetSilenceTimer();
      void Haptics.selectionAsync();
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
    if (isVoiceThrottled()) return;
    errorStreakRef.current = 0;
    void beginListening();
  }

  /** One shared failure path for error + nomatch events. */
  function handleRecognitionFailure(code: string): void {
    clearSilenceTimer();
    // Permanent: the code goes to the Expo terminal; on screen the streak
    // cap shows clean copy (no raw code), so a deaf recognizer still can't
    // fail silently.
    console.warn(`[voice] recognition failure: ${code}`);
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
    // Tap-to-talk: a miss ends the turn with a prompt, not a restart.
    setHeard("");
    setIssue(NOTHING_HEARD);
    safeStopListen();
    setBoth("idle");
  }

  async function handleUtterance(text: string): Promise<void> {
    clearSilenceTimer();
    const said = text.trim();
    safeStopListen();
    if (!aliveRef.current) return;
    if (said === "") {
      setHeard("");
      setIssue(NOTHING_HEARD);
      setBoth("idle");
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
    const ok = await send(said, undefined, { voiceMode: true });
    if (!aliveRef.current) return;
    if (!ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      handsFreeRef.current = false;
      setHandsFree(false);
      setIssue("Couldn't send that. Try again.");
      setBoth("idle");
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const replyMsg = useChatStore
      .getState()
      .messages.slice(before)
      .find((m) => m.role === "assistant");
    if (replyMsg === undefined) {
      handsFreeRef.current = false;
      setHandsFree(false);
      setIssue("No reply came back. Try again.");
      setBoth("idle");
      return;
    }
    speak(replyMsg.text);
  }

  function speak(text: string): void {
    clearSilenceTimer();
    if (!aliveRef.current) return;
    stopSpeaking();
    setReply(text);
    setHeard("");
    setIssue(null);
    if (!useVoice.getState().autoSpeak) {
      setBoth("idle");
      if (handsFreeRef.current) void beginListening(true);
      return;
    }
    setBoth("speaking");
    speakReply(text, {
      onDone: () => {
        if (!aliveRef.current || phaseRef.current !== "speaking") return;
        setBoth("idle");
        if (handsFreeRef.current) void beginListening(true);
      },
      onStopped: () => {
        if (!aliveRef.current || phaseRef.current !== "speaking") return;
        setBoth("idle");
        if (handsFreeRef.current) void beginListening(true);
      },
      onError: () => {
        if (!aliveRef.current) return;
        handsFreeRef.current = false;
        setHandsFree(false);
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
        // Tapping the mic while listening ends the conversation in
        // hands-free mode; in tap-to-talk it just cancels the listen.
        clearSilenceTimer();
        if (handsFreeRef.current) {
          handsFreeRef.current = false;
          setHandsFree(false);
        }
        safeStopListen();
        setBoth("idle");
        return;
      case "ignore":
        return; // request in flight, nothing to cut yet
      case "interrupt":
        stopSpeaking();
        setBoth("idle");
        if (handsFreeRef.current) void beginListening(true);
        return;
    }
  }

  /** Explicitly end a hands-free conversation. */
  function end(): void {
    clearSilenceTimer();
    handsFreeRef.current = false;
    setHandsFree(false);
    safeStopListen();
    stopSpeaking();
    setBoth("idle");
  }

  useSpeechRecognitionEvent("result", (event) => {
    if (!focusedRef.current) return;
    const text = event.results[0]?.transcript ?? "";
    if (text === "") return;
    errorStreakRef.current = 0;
    heardRef.current = text;
    setHeard(text);
    if (phaseRef.current === "listening") resetSilenceTimer();
    if (event.isFinal && !sentRef.current) {
      sentRef.current = true;
      void handleUtterance(text);
    }
  });
  useSpeechRecognitionEvent("nomatch", () => {
    // Final result with nothing recognizable: same path as a failure.
    if (!focusedRef.current) return;
    if (!aliveRef.current || phaseRef.current !== "listening") return;
    handleRecognitionFailure("nomatch");
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return; // our own stop()
    if (!focusedRef.current) return;
    if (!aliveRef.current || phaseRef.current !== "listening") return;
    handleRecognitionFailure(event.error);
  });

  useEffect(() => {
    // Tap-to-talk: open idle, wait for the mic tap.
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearSilenceTimer();
      safeStopListen();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { phase, heard, reply, issue, needsSettings, handsFree, bargeIn, retry, end };
}
