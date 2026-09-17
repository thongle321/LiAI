/** Vision stream: live frames over the backend WebSocket.
 *
 * The camera preview stays active while the screen is focused. Frames are
 * sent once per second only while the turn phase is idle/listening; they
 * pause during thinking/speaking so a queued caption cannot race a user
 * question. A question sends the current frame first, then the question,
 * which lets the backend cancel any in-flight caption before answering.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Camera } from "react-native-vision-camera";
import { useIsFocused } from "expo-router";

import { snapshotToBase64 } from "../lib/snapshot.ts";
import {
  frameMessage,
  parseServerMessage,
  questionMessage,
  shouldStreamFrames,
  visionSocketUrl,
} from "../lib/vision.ts";
import type { VoicePhase } from "../lib/voiceStatus.ts";

export type VisionStreamCallbacks = {
  onAnswer?: (text: string, sessionId?: string) => void;
  onCaption?: (text: string) => void;
  onError?: (message: string) => void;
};

export function useVisionStream(
  camera: RefObject<Camera | null>,
  cameraReady: () => boolean,
  phase: VoicePhase,
  callbacks: VisionStreamCallbacks = {},
) {
  const socket = useRef<WebSocket | null>(null);
  const capturing = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const cameraReadyRef = useRef(cameraReady);
  cameraReadyRef.current = cameraReady;
  const focused = useIsFocused();
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) return;
    let active = true;
    let failureReported = false;
    const reportFailure = (message: string): void => {
      if (!active || failureReported) return;
      failureReported = true;
      setProblem(message);
      callbacksRef.current.onError?.(message);
    };

    const ws = new WebSocket(visionSocketUrl());
    socket.current = ws;
    ws.onerror = () => reportFailure("Could not reach the vision stream");
    ws.onopen = () => {
      failureReported = false;
      if (active) setProblem(null);
    };
    ws.onclose = (event: { code?: unknown; reason?: unknown }) => {
      socket.current = null;
      const code = typeof event.code === "number" ? event.code : "?";
      const reason = typeof event.reason === "string" ? event.reason : "";
      reportFailure(`Vision stream closed (${code}${reason ? ` ${reason}` : ""})`);
    };
    ws.onmessage = (event: { data?: unknown }) => {
      const msg = parseServerMessage(event.data);
      if (msg.type === "answer") {
        callbacksRef.current.onAnswer?.(msg.text, msg.sessionId);
      } else if (msg.type === "caption") {
        callbacksRef.current.onCaption?.(msg.text);
      } else if (msg.type === "error") {
        callbacksRef.current.onError?.(msg.message);
      }
    };

    const timer = setInterval(() => {
      if (!shouldStreamFrames(phaseRef.current)) return;
      if (ws.readyState !== WebSocket.OPEN || capturing.current) return;
      const ref = camera.current;
      if (ref === null || !cameraReadyRef.current()) return;

      capturing.current = true;
      void snapshotToBase64(() => ref.takeSnapshot({ quality: 50 }))
        .then((jpeg) => {
          if (
            ws.readyState !== WebSocket.OPEN ||
            !shouldStreamFrames(phaseRef.current)
          ) {
            return;
          }
          ws.send(frameMessage(jpeg));
        })
        .catch((error: unknown) => {
          const detail =
            error instanceof Error ? error.message : String(error);
          setProblem(`Capture failed: ${detail}`);
        })
        .finally(() => {
          capturing.current = false;
        });
    }, 1000);

    return () => {
      active = false;
      clearInterval(timer);
      capturing.current = false;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      socket.current = null;
    };
  }, [camera, focused]);

  function sendQuestion(text: string, jpeg: string): boolean {
    const ws = socket.current;
    if (ws === null || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(frameMessage(jpeg));
      ws.send(questionMessage(text));
      return true;
    } catch {
      return false;
    }
  }

  return { problem, sendQuestion };
}
