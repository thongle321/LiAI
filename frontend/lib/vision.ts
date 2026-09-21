/** Vision socket protocol helpers (mirrors backend/app/realtime/ws.py).
 *
 * JSON text messages: {type:"frame",jpeg} / {type:"question",text} out,
 * {type:"answer"|"caption",text} / {type:"error",error} in.
 * Screen owns camera + rendering; everything wire-shaped lives here.
 */

import { API_BASE_URL } from "./api.ts";
import type { VoicePhase } from "./voiceStatus.ts";

export function visionSocketUrl(): string {
  return `${API_BASE_URL.replace(/^http/, "ws")}/api/vision/ws`;
}

/** Keep the preview live while idle/listening; pause while the AI answers
 * (including TTS), then resume for the next turn. */
export function shouldStreamFrames(phase: VoicePhase): boolean {
  return phase === "idle" || phase === "listening";
}

export function frameMessage(jpegBase64: string): string {
  return JSON.stringify({ type: "frame", jpeg: jpegBase64 });
}

export function questionMessage(text: string): string {
  return JSON.stringify({ type: "question", text });
}

export type VisionServerMessage =
  | { type: "answer"; text: string; sessionId?: string }
  | { type: "caption"; text: string; sessionId?: string }
  | { type: "error"; message: string }
  | { type: "other" };

function messageText(value: unknown): string {
  return typeof value === "string" && value !== "" ? value : "Request failed";
}

export function parseServerMessage(data: unknown): VisionServerMessage {
  if (typeof data !== "string") return { type: "other" };
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return { type: "other" };
  }
  if (typeof msg !== "object" || msg === null) return { type: "other" };
  const record = msg as Record<string, unknown>;
  const kind = record.type;
  if (kind === "answer" || kind === "caption") {
    return {
      type: kind,
      text: messageText(record.text),
      ...(typeof record.session_id === "string"
        ? { sessionId: record.session_id }
        : {}),
    };
  }
  if (record.type === "error") {
    const error = record.error;
    const message =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>).message
        : null;
    return { type: "error", message: messageText(message) };
  }
  return { type: "other" };
}
