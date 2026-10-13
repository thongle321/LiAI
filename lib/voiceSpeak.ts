/** Shared TTS voice (voice tab + vision screen + chat): one voice, one place.
 *
 * Extracted when vision became the second speaker — same language,
 * same callbacks, never throws (a missing native module reports
 * through onError like a playback failure).
 *
 * Ticket 03: speakReply/stopSpeaking are now thin adapters over the
 * voice store's engine layer, so every caller (auto-speak, per-message
 * play, preview, vision) speaks through the selected engine — system
 * or kokoro — with no per-caller routing.
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
  try {
    // One choke point: auto-speak and the per-message play button both
    // arrive here, so stripping once covers both (ticket 01 / spec Q10).
    void useVoice
      .getState()
      .play(stripForSpeech(text))
      .then(
        () => cbs.onDone?.(),
        () => cbs.onError?.(),
      );
  } catch {
    cbs.onError?.();
  }
}

/** ponytail: the native module is absent when the dev build predates
 * the dep — stop() then throws, so never let it take down the caller. */
export function stopSpeaking(): void {
  try {
    void useVoice.getState().stop();
  } catch {
    // nothing live to stop
  }
}
