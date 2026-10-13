/** Stop TTS playback when the app is backgrounded.
 *
 * Mounted once, at the app root (beside useEngineOffload). A reply still
 * speaking when the user leaves must not keep talking into the pocket.
 * No restore: TTS has no resident state worth reloading, it just stops.
 */

import { useEffect } from "react";
import { AppState } from "react-native";

import { watchBackgroundRelease } from "../lib/inference/offload.ts";
import { useVoice } from "../store/voice.ts";

export function useVoiceOffload(): void {
  useEffect(() => {
    return watchBackgroundRelease(AppState, {
      // Speech is never exempt: backgrounding always stops playback.
      isEnabled: () => true,
      release: () => {
        try {
          void useVoice.getState().stop();
        } catch {
          // voice failures must never break the offload path
        }
      },
    });
  }, []);
}
