/** Release the loaded model when the app is backgrounded.
 *
 * Mounted once, at the app root. The decision itself lives in
 * lib/inference/offload.ts so it is testable without a native module.
 */

import { useEffect } from "react";
import { AppState } from "react-native";

import { watchBackgroundRelease } from "../lib/inference/offload.ts";
import { useChatStore } from "../store/chat";
import { useInference } from "../store/inference.ts";

export function useEngineOffload(): void {
  useEffect(() => {
    return watchBackgroundRelease(AppState, {
      // Read at fire time, not subscribe time: the toggle can change while
      // the app is open.
      isEnabled: () => useInference.getState().autoOffload,
      release: () => useChatStore.getState().releaseEngine(),
    });
  }, []);
}
