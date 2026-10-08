/** Release the loaded model when the app is backgrounded.
 *
 * Mounted once, at the app root. The decision itself lives in
 * lib/inference/offload.ts so it is testable without a native module.
 */

import { useEffect } from "react";
import { AppState } from "react-native";

import { watchBackgroundRelease } from "../lib/inference/offload.ts";
import { useChatStore } from "../store/chat";
// The deep path is deliberate: store/chat.ts SHADOWS the store/chat/
// directory, so the bare specifier resolves to the barrel (which re-exports
// only the store surface) and not to the module holding this function.
import { reloadLocalEngine } from "../store/chat/index.ts";
import { useInference } from "../store/inference.ts";

export function useEngineOffload(): void {
  useEffect(() => {
    return watchBackgroundRelease(AppState, {
      // Read at fire time, not subscribe time: the toggle can change while
      // the app is open.
      isEnabled: () => useInference.getState().autoOffload,
      release: () => useChatStore.getState().releaseEngine(),
      // Reload what we just released, while the user is reading rather
      // than waiting on a reply (PocketPal ModelStore.ts:1163). Swallowed
      // on purpose: reloadLocalEngine throws on a failed load, and a
      // foreground preload has nobody to report to — the next send runs
      // the same path and surfaces it properly.
      restore: () => {
        void reloadLocalEngine().catch(() => {});
      },
    });
  }, []);
}
