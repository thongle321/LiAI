/** Shared TTS playback (voice tab + vision screen + chat replay): one voice,
 * one engine, one place.
 *
 * Everything routes through lib/tts — System included — so there is exactly
 * one stop path and one engine runtime regardless of which engine is
 * selected (the seam deliberately carries no expo-spech-specific branching).
 *
 * `onDone` vs `onStopped`: the native layer reports playback-end and
 * user-interrupt through the same completion as far as this seam can see,
 * so a stop request issued while an utterance was in flight is what
 * distinguishes them. Without that, callers that clear a "speaking"
 * indicator on interrupt would keep it stuck on screen.
 */

import { getEngine } from "./tts/engineRegistry.ts";
import { resolveSystemDefaultVoice } from "./tts/engines/system.ts";
import { ttsRuntime } from "./tts/runtime.ts";
import type { Voice } from "./tts/types.ts";
import { useVoice } from "../store/voice.ts";

export type SpeakCallbacks = {
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

/** Bumped by stopSpeaking() so an in-flight utterance can tell an
 *  interrupt from a natural finish. */
let stopRequests = 0;

async function currentVoice(): Promise<Voice> {
  return (await useVoice.getState().currentVoice) ?? resolveSystemDefaultVoice();
}

export function speakReply(text: string, cbs: SpeakCallbacks = {}): void {
  const mark = stopRequests;
  void (async () => {
    try {
      const voice = await currentVoice();
      await getEngine(voice.engine).play(text, voice);
      if (stopRequests !== mark) cbs.onStopped?.();
      else cbs.onDone?.();
    } catch {
      cbs.onError?.();
    }
  })();
}

/** Stop live playback. Serialized through the runtime so a playback queued
 *  after the stop is not itself cancelled. Never throws: the native module
 *  is absent when the dev build predates the dependency. */
export function stopSpeaking(): void {
  stopRequests += 1;
  void ttsRuntime.stop().catch(() => {
    // nothing live to stop
  });
}