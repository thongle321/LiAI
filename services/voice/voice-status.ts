/** Voice-mode turn phases and their status-line labels. */

import type { VoiceOrbState } from "expo-thinking-orbs";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

export const VOICE_STATUS_LABEL: Record<VoicePhase, string> = {
  idle: "Tap to talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

/** The "Playing audio…" block renders only while the AI replies. */
export function showsReplyOverlay(phase: VoicePhase): boolean {
  return phase === "speaking";
}

/** Consecutive recognition failures without any transcript. */
export const MAX_VOICE_ERROR_STREAK = 5;

/** Lockout after Google throttles us: every new start() extends the ban. */
export const VOICE_THROTTLE_MS = 60_000;

// Shared across dictation + voice tab (chat stays mounted under
// /voice): per-component refs let the other screen restart mid-ban.
let throttledUntilTs = 0;

/** True while a throttle ban is active. */
export function isVoiceThrottled(now: number = Date.now()): boolean {
  return now < throttledUntilTs;
}

/** Start the lockout. */
export function setVoiceThrottled(now: number = Date.now()): void {
  throttledUntilTs = now + VOICE_THROTTLE_MS;
}

/** Clear the lockout (tests, explicit user retry after waiting). */
export function clearVoiceThrottle(): void {
  throttledUntilTs = 0;
}

/** Throttle codes: retrying immediately makes the ban longer. */
export function isThrottlingError(code: string): boolean {
  return code === "too-many-requests" || code === "busy";
}

export type VoiceErrorAction = { fatal: boolean; message: string };
export type BargeAction = "begin" | "stop" | "interrupt" | "ignore";

/** Nudge-and-retry, or give up with clean copy (the raw code stays in the
 * console, per the Q3 decision — never surface it in the UI). */
export function voiceErrorAction(streak: number, code: string): VoiceErrorAction {
  if (code === "not-allowed") {
    return { fatal: true, message: "Microphone access is needed." };
  }
  // Throttled: every new start() extends the ban, so stop at once.
  if (isThrottlingError(code)) {
    return { fatal: true, message: "Too many voice requests — wait a bit and try again." };
  }
  if (streak + 1 >= MAX_VOICE_ERROR_STREAK) {
    // No raw code in the message; the caller logs the code already.
    return { fatal: true, message: "Having trouble hearing you — try again." };
  }
  return { fatal: false, message: "" };
}

/** Mic-tap action per phase: taps stop back to idle, never auto-listen. */
export function bargeActionFor(phase: VoicePhase): BargeAction {
  switch (phase) {
    case "speaking":
      return "interrupt";
    case "listening":
      return "stop";
    case "thinking":
      return "ignore";
    case "idle":
      return "begin";
  }
}

// ---------------------------------------------------------------------------
// Unified Whisper voice mode (ported from PocketPal useVoiceMode; #1017).
// The old OS-STT block above now serves only hooks/useVisionTurn.ts (its
// last consumer after the voice tab moved onto the controller below);
// hooks/useVoiceLoop.ts, its other consumer, is gone.
// ---------------------------------------------------------------------------

/** One voice session's phase. `closed` = no session (tap to start). */
export type VoiceModePhase =
  | "closed"
  | "starting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

export const VOICE_MODE_LABEL: Record<VoiceModePhase, string> = {
  closed: "Tap to talk",
  starting: "Loading voice…",
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

/** Which expo-thinking-orbs behaviour matches the session right now. The
 *  orb's own nine-state union is LiveKit's AgentState; LiAI's phases map in
 *  one direction onto a subset, with `failed` reserved for a CLOSED session
 *  under an issue (dead gate) — a mid-session problem (`listening` with an
 *  issue, say) keeps its live behaviour and leaves the wording to the issue
 *  line, because freezing the shell would contradict the still-running turn. */
export function voiceOrbStateFor(
  phase: VoiceModePhase,
  failed: boolean,
): VoiceOrbState {
  if (phase === "closed") return failed ? "failed" : "idle";
  switch (phase) {
    case "starting":
      return "initializing";
    case "listening":
      return "listening";
    case "speaking":
      return "speaking";
    default:
      // transcribing + thinking are one behaviour: the in-flight wait.
      return "thinking";
  }
}
