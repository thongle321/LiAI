/** Waiting on the voice store's playback state machine.
 *
 *  Shared by the cascade engine (a turn must not end while its reply is
 *  still being spoken) and the chat voice port (which starts the speech) —
 *  one place, so both agree on what "the reply is done playing" means.
 */

import { useVoice } from "@/store/voice.ts";

/** Resolves once the voice store returns to idle playback. */
export function whenPlaybackIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (useVoice.getState().playbackState.mode === "idle") {
      resolve();
      return;
    }
    const unsubscribe = useVoice.subscribe((state) => {
      if (state.playbackState.mode === "idle") {
        unsubscribe();
        resolve();
      }
    });
  });
}
