/** System TTS engine (ticket 03 / spec Q2, Q5, Q9).
 *
 * Wraps the OS-native expo-speech path. Offers exactly one row — the
 * device default voice (Q9: system voices are never enumerated or pinned).
 * The speech module is injected so node tests drive it with fakes (the
 * repo's dynamic-loader pattern, see services/tts//download.ts); Metro bundles
 * expo-speech statically through the app wiring in engineRegistry.
 */

import type { Engine, StreamingHandle, StreamOptions, Voice } from "../types.ts";
import { DEVICE_DEFAULT_VOICE } from "../types.ts";

export interface SystemSpeakOptions {
  language?: string;
  voice?: string;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
}

/** Structural view of expo-speech — `speak(text, options)` + `stop()`. */
export interface SpeechApi {
  speak: (text: string, options: SystemSpeakOptions) => void;
  stop: () => void;
}

export function createSystemEngine(load: () => Promise<SpeechApi>): Engine {
  /** Terminal resolver for the in-flight play, kept so stop() can settle
   *  a play the OS never reports back on (the native module calls
   *  onStopped on stop(); fakes may not). Null when nothing is live. */
  let settle: (() => void) | null = null;

  return {
    id: "system",

    async isInstalled(): Promise<boolean> {
      return true;
    },

    async getVoices() {
      return [DEVICE_DEFAULT_VOICE];
    },

    async loadInto(): Promise<void> {
      // The OS native path has no model to load; a no-op keeps the
      // engine-slot contract uniform.
    },

    async play(text: string): Promise<void> {
      const api = await load();
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          settle = null;
          resolve();
        };
        const fail = (): void => {
          if (done) return;
          done = true;
          settle = null;
          reject(new Error("playback failed"));
        };
        settle = finish;
        api.speak(text, {
          // Q9: never pin an OS voice id. The language pin matches the
          // long-standing speakReply behaviour for the device-default row.
          language: "en-US",
          onDone: finish,
          onStopped: finish,
          onError: fail,
        });
      });
    },

    playStreaming(voice: Voice, waitFor?: Promise<void>, _streamOpts?: StreamOptions): StreamingHandle {
      // expo-speech has no native streaming; buffer text and speak it on
      // finalize. cancel drops the buffer and stops any in-flight speech.
      const buffer: string[] = [];
      let dead = false;
      const ready = (waitFor ?? Promise.resolve()).catch(() => undefined);
      const speakBuffered = async (): Promise<void> => {
        const text = buffer.join("");
        buffer.length = 0;
        if (text.trim() === "") return;
        await new Promise<void>((resolve) => {
          void (async () => {
            try {
              const api = await load();
              api.speak(text, {
                language: "en-US",
                onDone: () => resolve(),
                onStopped: () => resolve(),
                onError: () => resolve(),
              });
            } catch {
              resolve();
            }
          })();
        });
      };
      return {
        appendText(chunk: string) {
          if (dead) return;
          buffer.push(chunk);
        },
        async finalize() {
          if (dead) return;
          await ready;
          await speakBuffered();
        },
        async cancel() {
          if (dead) return;
          dead = true;
          buffer.length = 0;
          try {
            const api = await load();
            api.stop();
          } catch {
            // nothing live to stop
          }
          settle?.();
        },
      };
    },

    async stop(): Promise<void> {
      const api = await load();
      api.stop();
      // Covers both worlds: expo-speech also fires onStopped here (the
      // finish guard makes that a no-op), and a speech module that never
      // reports still lets play() settle.
      settle?.();
    },
  };
}
