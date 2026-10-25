/** Bridges `@pocketpalai/react-native-speech`'s `createSpeechStream` with
 *  LiAI's `ttsRuntime` engine-swap guard. Ported from pocketpal-ai's
 *  `src/services/tts/streamingHandle.ts`.
 */

import Speech, { type SpeechStreamOptions } from "@pocketpalai/react-native-speech";

import { ttsRuntime } from "./runtime.ts";
import type { Engine, StreamOptions, StreamingHandle } from "./types.ts";

const STREAM_TARGET_CHARS = 300;

export function createEngineStreamingHandle(
  engine: Engine,
  voiceId: string,
  options?: Omit<SpeechStreamOptions, "targetChars" | "onError"> & StreamOptions,
  waitFor?: Promise<void>,
): StreamingHandle {
  const { onProgress, ...streamOptions } = options ?? {};

  let stream: ReturnType<typeof Speech.createSpeechStream> | null = null;
  let acquired = false;
  let dead = false;
  const pending: string[] = [];

  const ready = (waitFor ?? Promise.resolve())
    .catch(() => {
      // Swallow stop errors - we still want to start the new stream.
    })
    .then(() => {
      if (dead) return;
      return ttsRuntime.acquire(engine, async () => {
        if (dead) return;
        stream = Speech.createSpeechStream(voiceId, {
          targetChars: STREAM_TARGET_CHARS,
          ...streamOptions,
        });
        if (onProgress) {
          stream.onProgress(onProgress);
        }
        acquired = true;
        for (const chunk of pending) {
          stream.append(chunk);
        }
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
      if (acquired && stream) {
        stream.append(chunk);
      } else {
        pending.push(chunk);
      }
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
      if (stream) {
        await stream.cancel();
      }
    },
  };
}