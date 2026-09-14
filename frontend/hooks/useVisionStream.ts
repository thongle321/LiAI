/** Vision stream hook: socket + snapshot loop for the Vision screen.
 *
 * Owns the WebSocket, the 1s capture tick, and the entry list. The screen
 * owns rendering, the camera element, and the draft box. Capture reads
 * takeSnapshot() from the live preview buffer — no still-photo pipeline.
 * Protocol shapes live in lib/vision.ts (tested); this hook is wiring.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Camera } from "react-native-vision-camera";
import {
  deleteAsync,
  EncodingType,
  readAsStringAsync,
} from "expo-file-system/legacy";

import {
  frameMessage,
  parseServerMessage,
  questionMessage,
  visionSocketUrl,
} from "../lib/vision.ts";

export type VisionPhase = "connecting" | "open" | "failed";

export function useVisionStream(
  camera: RefObject<Camera | null>,
  cameraReady: RefObject<boolean>,
) {
  const socket = useRef<WebSocket | null>(null);
  // PocketPal pattern: a slow capture must not overlap the next tick
  const capturing = useRef(false);
  const [phase, setPhase] = useState<VisionPhase>("connecting");
  const [problem, setProblem] = useState("");
  const [entries, setEntries] = useState<string[]>([]);
  const [captureStatus, setCaptureStatus] = useState("starting…");

  function appendEntry(text: string): void {
    setEntries((prev) => [...prev, text]);
  }

  useEffect(() => {
    const ws = new WebSocket(visionSocketUrl());
    socket.current = ws;
    ws.onerror = () => {
      setProblem("Could not reach the vision stream");
      setPhase("failed");
    };
    ws.onopen = () => setPhase("open");
    ws.onclose = (event: { code?: unknown; reason?: unknown }) => {
      socket.current = null;
      const code = typeof event.code === "number" ? event.code : "?";
      const reason = typeof event.reason === "string" ? event.reason : "";
      setProblem(`Vision stream closed (${code}${reason ? ` ${reason}` : ""})`);
      setPhase("failed");
    };
    ws.onmessage = (event: { data?: unknown }) => {
      const msg = parseServerMessage(event.data);
      if (msg.type === "answer") {
        appendEntry(msg.text);
      } else if (msg.type === "caption") {
        appendEntry(`Live: ${msg.text}`);
      } else if (msg.type === "error") {
        setProblem(msg.message);
      }
    };
    // Last skip reason logged, so a wedged capture can't go silent.
    // Transitions only — no per-tick spam.
    let lastSkip = "";
    const skip = (reason: string): void => {
      if (reason !== lastSkip) {
        lastSkip = reason;
        console.log(`[vision] capture skipped: ${reason}`);
        setCaptureStatus(`waiting: ${reason}`);
      }
    };
    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        skip("socket not open");
        return;
      }
      const ref = camera.current;
      if (!ref) {
        skip("no camera ref");
        return;
      }
      if (!cameraReady.current) {
        skip("camera not initialized");
        return;
      }
      if (capturing.current) {
        skip("previous capture still in flight");
        return;
      }
      lastSkip = "";
      setCaptureStatus("capturing…");
      capturing.current = true;
      // A snapshot promise that never settles would wedge the guard
      // forever — time out so the next tick retries.
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("snapshot timed out")), 5000);
      });
      void Promise.race([ref.takeSnapshot({ quality: 50 }), timeout])
        .then(async (snapshot) => {
          // VisionCamera returns a bare path; expo-file-system needs a URI.
          const uri = snapshot.path.startsWith("file://")
            ? snapshot.path
            : `file://${snapshot.path}`;
          try {
            const jpeg = await readAsStringAsync(uri, {
              encoding: EncodingType.Base64,
            });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(frameMessage(jpeg));
              const kb = Math.round(jpeg.length / 1024);
              setCaptureStatus(`frame sent (${kb} KB)`);
            }
          } finally {
            await deleteAsync(uri, { idempotent: true }).catch(
              () => undefined,
            );
          }
        })
        .catch((e: unknown) => {
          const detail =
            typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
          // Inline only: console.error would raise the dev overlay.
          setProblem(`Capture failed: ${detail}`);
        })
        .finally(() => {
          capturing.current = false;
        });
    }, 1000);
    return () => {
      clearInterval(timer);
      ws.close();
      socket.current = null;
    };
  }, []); // refs stable, read via .current — never resubscribe

  async function sendQuestion(text: string): Promise<void> {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || text === "") return;
    appendEntry(`You: ${text}`);
    ws.send(questionMessage(text));
  }

  return {
    phase,
    problem,
    entries,
    captureStatus,
    sendQuestion,
    setProblem,
  };
}
