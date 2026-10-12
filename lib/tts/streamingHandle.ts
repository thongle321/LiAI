import Speech, { type SpeechStreamOptions } from "@pocketpalai/react-native-speech";

import { ttsRuntime } from "./runtime.ts";
import type { Engine, StreamingHandle } from "./types.ts";

/**
 * Characters aimed for in each synthesis batch after the first sentence.
 * 300 matches the library default and gives natural multi-sentence
 * prosody without pushing the second-batch latency too high.
 */
const STREAM_TARGET_CHARS = 300;

/**
 * Bridges `Speech.createSpeechStream` with the runtime's engine-swap guard.
 *
 * The library's stream calls `Speech.speak` internally, which does not
 * route through `ttsRuntime.acquire` — so we pin the engine once up front
 * and hold appends in a queue until the acquire resolves. Creating the
 * stream earlier would bind it to whichever engine was loaded before.
 *
 * `waitFor` sequences the acquire behind an external promise (e.g. a prior
 * `stop()`), so the old stop can't kill the new stream's first sentence.
 */
export function createEngineStreamingHandle(
  engine: Engine,
  voiceId: string,
  options?: Omit<SpeechStreamOptions, "targetChars" | "onError">,
  waitFor?: Promise<void>,
): StreamingHandle {
  let stream: ReturnType<typeof Speech.createSpeechStream> | null = null;

  let acquired = false;
  let dead = false;
  const pending: string[] = [];

  const ready = (waitFor ?? Promise.resolve())
    .catch(() => {
      // Swallow stop errors — we still want to start the new stream.
    })
    .then(() => {
      // Cancelled while waiting: skip the acquire entirely rather than
      // loading a 200+ MB engine for nothing.
      if (dead) return;
      return ttsRuntime.acquire(engine, async () => {
        if (dead) return;
        stream = Speech.createSpeechStream(voiceId, {
          targetChars: STREAM_TARGET_CHARS,
          ...options,
        });
        acquired = true;
        for (const chunk of pending) stream.append(chunk);
        pending.length = 0;
      });
    })
    .catch((err) => {
      console.warn(`[${engine.id}] streaming acquire failed:`, err);
      throw err;
    });

  return {
    appendText(chunk: string) {
      if (dead) return;
      if (acquired && stream) stream.append(chunk);
      else pending.push(chunk);
    },
    async finalize() {
      if (dead) return;
      await ready;
      await stream?.finalize();
    },
    async cancel() {
      if (dead) return;
      dead = true;
      pending.length = 0;
      if (stream) await stream.cancel();
    },
  };
}