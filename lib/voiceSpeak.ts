/** Shared TTS voice (voice tab + vision screen): one voice, one place.
 *
 * Extracted when vision became the second speaker — same language,
 * same callbacks, never throws (a missing native module reports
 * through onError like a playback failure).
 */
import * as Speech from "expo-speech";

import { useVoice } from "../store/voice.ts";

export type SpeakCallbacks = {
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

export function speakReply(text: string, cbs: SpeakCallbacks = {}): void {
  const { voiceId, rate, pitch } = useVoice.getState();
  try {
    Speech.speak(text, {
      language: "en-US",
      voice: voiceId ?? undefined,
      rate,
      pitch,
      onDone: () => cbs.onDone?.(),
      onStopped: () => cbs.onStopped?.(),
      onError: () => cbs.onError?.(),
    });
  } catch {
    cbs.onError?.();
  }
}

/** ponytail: the native module is absent when the dev build predates
 * the dep — stop() then throws, so never let it take down the caller. */
export function stopSpeaking(): void {
  try {
    void Speech.stop();
  } catch {
    // nothing live to stop
  }
}
