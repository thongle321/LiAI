/** Watch mode (vision-series 05): continuous CAPTURE, answer only on ask.
 *
 * While on, a timer snapshots the live preview into a rolling buffer
 * (services/vision/vision-watch.ts pushFrame, capped at the per-turn image limit).
 * The loop contains NO inference: no send, no completion, no chat store —
 * frames are only read by the ask path when the user asks a question
 * (recorded product decision; the reference app's auto-send loop is
 * rejected). Stop, screen exit, and losing focus all halt the timer and
 * clear the buffer, so nothing stale rides the next question.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Camera as VisionCameraView } from "react-native-vision-camera";

import { MAX_IMAGES } from "../services/chat/attachments.ts";
import { pushFrame } from "../services/vision/vision-watch.ts";
import { snapshotToBase64 } from "../services/storage/snapshot.ts";
import { useWatch } from "../store/watch.ts";

export function useWatchMode(
  camera: RefObject<VisionCameraView | null>,
  cameraReady: () => boolean,
  active: boolean,
) {
  const [watchOn, setWatchOn] = useState(false);
  const intervalMs = useWatch((s) => s.watchIntervalMs);
  const setWatchIntervalMs = useWatch((s) => s.setWatchIntervalMs);
  const framesRef = useRef<string[]>([]);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!watchOn || !active) return;
    let stopped = false;
    const timer = setInterval(() => {
      // A slow frame never queues captures: one snapshot in flight at most.
      if (inFlightRef.current) return;
      const cam = camera.current;
      if (cam === null || !cameraReady()) return;
      inFlightRef.current = true;
      void (async () => {
        try {
          const jpeg = await snapshotToBase64(() =>
            cam.takeSnapshot({ quality: 50 }),
          );
          if (!stopped) {
            framesRef.current = pushFrame(
              framesRef.current,
              `data:image/jpeg;base64,${jpeg}`,
              MAX_IMAGES,
            );
          }
        } catch {
          // A dropped frame is not an error; the buffer just holds less.
        } finally {
          inFlightRef.current = false;
        }
      })();
    }, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
      // Fresh on resume: frames captured before losing focus are stale.
      framesRef.current = [];
    };
  }, [watchOn, active, intervalMs, camera, cameraReady]);

  function stopWatch(): void {
    setWatchOn(false);
    framesRef.current = [];
  }

  return {
    watchOn,
    intervalMs,
    setWatchIntervalMs,
    /** The rolling buffer, read by the ask path at question time. */
    frames: () => framesRef.current,
    toggleWatch: () => {
      if (watchOn) stopWatch();
      else setWatchOn(true);
    },
    stopWatch,
  };
}
