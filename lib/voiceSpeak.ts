/** Shared TTS voice (voice tab + vision screen + chat): one voice, one place.
 *
 * Extracted when vision became the second speaker — same language,
 * same callbacks, never throws (a missing native module reports
 * through onError like a playback failure).
 */
import * as Speech from "expo-speech";

import { stripForSpeech } from "./stripForSpeech.ts";
import { useVoice } from "../store/voice.ts";

export type SpeakCallbacks = {
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

export function speakReply(text: string, cbs: SpeakCallbacks = {}): void {
  const { voiceId } = useVoice.getState();
  try {
    // One choke point: auto-speak and the per-message play button both
    // arrive here, so stripping once covers both (ticket 01 / spec Q10).
    Speech.speak(stripForSpeech(text), {
      // Only pin a language when no voice is chosen: forcing "en-US" beside
      // a picked voice fights it, and the voice already carries its own
      // language. With no voice this is exactly what it did before.
      language: voiceId ? undefined : "en-US",
      voice: voiceId ?? undefined,
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