/** Voice-mode turn phases and their status-line labels. */

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

export type VoiceErrorAction = { fatal: boolean; message: string };
export type BargeAction = "begin" | "stop" | "interrupt" | "ignore";

/** Nudge-and-retry, or give up naming the recognizer's error code. */
export function voiceErrorAction(streak: number, code: string): VoiceErrorAction {
  if (code === "not-allowed") {
    return { fatal: true, message: "Microphone access is needed." };
  }
  // Throttled: every new start() extends the ban, so stop at once.
  if (code === "too-many-requests") {
    return { fatal: true, message: "Too many voice requests — wait a bit and try again." };
  }
  if (streak + 1 >= MAX_VOICE_ERROR_STREAK) {
    return { fatal: true, message: `Having trouble hearing you (${code}).` };
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
