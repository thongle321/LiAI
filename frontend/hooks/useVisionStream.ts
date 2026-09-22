/** Vision stream: live frames over the backend WebSocket.
 *
 * The camera preview stays active while the screen is focused. A 500ms
 * interval snapshots (quality-50 JPEG) and sends while idle/listening.
 * Uploads pause while the AI answers (including TTS) or a chat send is in
 * flight, then resume for the next turn. A question sends the current frame
 * first, then the question, which lets the backend cancel any in-flight
 * caption before answering.
 *
 * A bridge-free Worklet Frame Processor is attached to the Camera so the
 * frame pipeline stays live for future on-worklet pixel work. It makes no
 * JS calls: the cross-generation worklet→JS bridge proved unreliable
 * (first a scheduleOnRN crash, then silent ticks), so cadence stays on
 * the proven interval until the toolchain aligns on one worklets
 * generation. Requires a dev binary built with enableFrameProcessors.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Camera } from "react-native-vision-camera";
import { runAtTargetFps, useFrameProcessor } from "react-native-vision-camera";
import { useIsFocused } from "expo-router";

import { snapshotToBase64 } from "../lib/snapshot.ts";
import {
  frameMessage,
  parseServerMessage,
  questionMessage,
  visionSocketUrl,
} from "../lib/vision.ts";

export type VisionStreamCallbacks = {
  onAnswer?: (text: string, sessionId?: string) => void;
  onCaption?: (text: string) => void;
  onError?: (message: string) => void;
};

export function useVisionStream(
  camera: RefObject<Camera | null>,
  cameraReady: () => boolean,
  enabled = true,
  callbacks: VisionStreamCallbacks = {},
) {
  const socket = useRef<WebSocket | null>(null);
  const capturing = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const cameraReadyRef = useRef(cameraReady);
  cameraReadyRef.current = cameraReady;
  const focused = useIsFocused();
  const [problem, setProblem] = useState<string | null>(null);

  /** Pipeline heartbeat: keeps the frame processor live without crossing
   * the worklet→JS bridge. Cadence comes from the interval below. */
  const frameProcessor = useFrameProcessor(() => {
    "worklet";
    runAtTargetFps(2, () => {
      "worklet";
    });
  }, []);

  useEffect(() => {
    if (!focused) return;
    let active = true;
    let failureReported = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const reportFailure = (message: string): void => {
      if (!active || failureReported) return;
      failureReported = true;
      setProblem(message);
      callbacksRef.current.onError?.(message);
    };

    function scheduleReconnect(): void {
      if (!active || reconnectTimer !== null) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!active) return;
        connect();
      }, 2000);
    }

    function connect(): void {
      if (!active) return;
      const ws = new WebSocket(visionSocketUrl());
      socket.current = ws;

      ws.onerror = () => {
        reportFailure("Could not reach the vision stream");
      };

      ws.onopen = () => {
        failureReported = false;
        if (active) setProblem(null);
      };

      ws.onclose = (event: { code?: unknown; reason?: unknown }) => {
        if (socket.current === ws) socket.current = null;
        const code = typeof event.code === "number" ? event.code : "?";
        const reason = typeof event.reason === "string" ? event.reason : "";
        reportFailure(`Vision stream closed (${code}${reason ? ` ${reason}` : ""})`);
        scheduleReconnect();
      };

      ws.onmessage = (event: { data?: unknown }) => {
        if (!active) return;
        const msg = parseServerMessage(event.data);
        if (msg.type === "answer") {
          callbacksRef.current.onAnswer?.(msg.text, msg.sessionId);
        } else if (msg.type === "caption") {
          callbacksRef.current.onCaption?.(msg.text);
        } else if (msg.type === "error") {
          callbacksRef.current.onError?.(msg.message);
        }
      };
    }

    connect();

    const timer = setInterval(() => {
      if (!enabledRef.current) return;
      const ws = socket.current;
      if (ws === null || ws.readyState !== WebSocket.OPEN || capturing.current) return;
      const ref = camera.current;
      if (ref === null || !cameraReadyRef.current()) return;

      capturing.current = true;
      void snapshotToBase64(() => ref.takeSnapshot({ quality: 50 }))
        .then((jpeg) => {
          const currentWs = socket.current;
          if (
            !active ||
            currentWs === null ||
            currentWs.readyState !== WebSocket.OPEN ||
            !cameraReadyRef.current() ||
            !enabledRef.current
          ) {
            return;
          }
          currentWs.send(frameMessage(jpeg));
        })
        .catch((error: unknown) => {
          if (!active) return;
          const detail =
            error instanceof Error ? error.message : String(error);
          setProblem(`Capture failed: ${detail}`);
        })
        .finally(() => {
          capturing.current = false;
        });
    }, 500);

    return () => {
      active = false;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      clearInterval(timer);
      capturing.current = false;
      const ws = socket.current;
      if (
        ws !== null &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
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
      // If the socket closes between messages, do not send an orphan question.
      if (ws.readyState !== WebSocket.OPEN) return false;
      ws.send(questionMessage(text));
      return true;
    } catch {
      return false;
    }
  }

  return {
    problem,
    sendQuestion,
    isCapturing: () => capturing.current,
    frameProcessor,
  };
}
