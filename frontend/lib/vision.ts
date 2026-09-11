/** Vision socket protocol helpers (mirrors backend/app/realtime/ws.py).
 *
 * JSON text messages: {type:"frame",jpeg} / {type:"question",text} out,
 * {type:"answer"|"caption",text} / {type:"error",error} in.
 * Screen owns camera + rendering; everything wire-shaped lives here.
 */

import { API_BASE_URL } from "./api.ts";

export function visionSocketUrl(): string {
  return `${API_BASE_URL.replace(/^http/, "ws")}/api/vision/ws`;
}

export function frameMessage(jpegBase64: string): string {
  return JSON.stringify({ type: "frame", jpeg: jpegBase64 });
}

export function questionMessage(text: string): string {
  return JSON.stringify({ type: "question", text });
}

export type VisionServerMessage =
  | { type: "answer"; text: string }
  | { type: "caption"; text: string }
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
  if (record.type === "answer") {
    return { type: "answer", text: messageText(record.text) };
  }
  if (record.type === "caption") {
    return { type: "caption", text: messageText(record.text) };
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
