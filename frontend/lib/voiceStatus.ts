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

export type BargeAction = "begin" | "restart" | "interrupt" | "ignore";

/** Mic-tap action per phase: taps never kill the hands-free loop. */
export function bargeActionFor(phase: VoicePhase): BargeAction {
  switch (phase) {
    case "speaking":
      return "interrupt";
    case "listening":
      return "restart";
    case "thinking":
      return "ignore";
    case "idle":
      return "begin";
  }
}
