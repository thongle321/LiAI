/** Kokoro tracer (issue 02) — one-shot speak path over sherpa-onnx.
 *
 * Proves the tracer bullet end to end: a downloaded model's local path →
 * engine init → a sentence audible through the library's NATIVE PCM player
 * (spec Q5 — no extra player dependency).
 *
 * Why the STREAMING engine: spec open item 3 asked whether the batch engine
 * (`createTTS`) exposes the PCM player. The shipped 0.4.4 TypeScript
 * declarations answer no — `TtsEngine` has `generateSpeech` etc. but no
 * `startPcmPlayer`; the player exists only on `StreamingTtsEngine` from
 * `createStreamingTTS`. Spec pre-authorized the fallback: use the streaming
 * engine with a full-buffer write. `generateSpeechStream` resolves once
 * native generation STARTS; chunks and the end/error events arrive later,
 * so the promise here settles on those events.
 *
 * The engine module is imported DYNAMICALLY (repo keep-awake pattern) so
 * node tests exercise the sequencing with a fake engine injected through
 * the loader; the native module never loads in tests.
 */

import type { TTSModelType } from "react-native-sherpa-onnx/tts";

/** Registry id of the tracer model (GitHub release tag `tts-models`):
 *  98.5 MB int8 English kokoro. `kokoro-en-v0_19` is the 304.8 MB fp32
 *  sibling — same voices, heavier download. */
export const KOKORO_EN_MODEL_ID = "kokoro-int8-en-v0_19";

/** The canned line the tracer speaks on device. */
export const KOKORO_CANNED_LINE =
  "Hello! This is the LiAI neural voice, speaking fully offline on your device.";

/** Minimal structural view of the streaming engine's playback surface —
 *  a subset of the real `StreamingTtsEngine`, so tests can fake it. */
export interface PcmPlaybackEngine {
  getSampleRate(): Promise<number>;
  startPcmPlayer(sampleRate: number, channels: number): Promise<void>;
  writePcmChunk(samples: number[]): Promise<void>;
  stopPcmPlayer(): Promise<void>;
  generateSpeechStream(
    text: string,
    options: { sid?: number; speed?: number } | undefined,
    handlers: {
      onChunk?: (chunk: { samples: number[] }) => void;
      onEnd?: () => void;
      onError?: (event: { message: string }) => void;
    },
  ): Promise<{ cancel(): Promise<void>; unsubscribe(): void }>;
  destroy(): Promise<void>;
}

/** The subset of `react-native-sherpa-onnx/tts` the tracer uses. */
export interface SherpaTtsApi {
  createStreamingTTS(options: {
    modelPath: { type: "file"; path: string };
    modelType?: TTSModelType;
  }): Promise<PcmPlaybackEngine>;
}

export interface SpeakOnceOptions {
  /** Local model directory from the download bridge. */
  modelPath: string;
  text: string;
  /** Speaker id; kokoro-en-v0_19 has 11 (0..10). */
  sid?: number;
  speed?: number;
  /** Stop path (ticket 03): aborting cancels the in-flight generation and
   *  the one-shot then RESOLVES — a stop is a clean terminal state. */
  signal?: AbortSignal;
}

/** Generate `text` from a downloaded model and play it through the native
 *  mono PCM player. Rejects on generation errors; the player is always
 *  stopped and the engine destroyed on the way out. */
export async function speakOnce(
  load: () => Promise<SherpaTtsApi>,
  options: SpeakOnceOptions,
): Promise<void> {
  if (options.signal?.aborted) return;
  const api = await load();
  const engine = await api.createStreamingTTS({
    modelPath: { type: "file", path: options.modelPath },
    modelType: "kokoro",
  });
  try {
    const sampleRate = await engine.getSampleRate();
    await engine.startPcmPlayer(sampleRate, 1);
    try {
      await new Promise<void>((resolve, reject) => {
        let handle: { cancel(): Promise<void>; unsubscribe(): void } | null = null;
        let cancelled = false;
        const settle = (): void => {
          options.signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        function onAbort(): void {
          cancelled = true;
          if (handle !== null) {
            void handle
              .cancel()
              .catch(() => {
                // A cancel racing native teardown may throw; the player
                // stop below still runs either way.
              })
              .then(() => settle());
          }
        }
        options.signal?.addEventListener("abort", onAbort);
        const generationOptions =
          options.sid !== undefined || options.speed !== undefined
            ? {
                ...(options.sid !== undefined ? { sid: options.sid } : {}),
                ...(options.speed !== undefined ? { speed: options.speed } : {}),
              }
            : undefined;
        engine
          .generateSpeechStream(options.text, generationOptions, {
            onChunk: (chunk) => {
              // Backpressure: a chunk written after stop/destroy would throw
              // into the event emitter with nobody to catch it.
              engine.writePcmChunk(chunk.samples).catch(reject);
            },
            onEnd: () => settle(),
            onError: (event) => {
              if (!cancelled) reject(new Error(event.message));
            },
          })
          .then((h) => {
            handle = h;
            // An abort that raced the stream start still cancels.
            if (cancelled) {
              void h
                .cancel()
                .catch(() => {})
                .then(() => settle());
            }
          })
          .catch(reject);
      });
    } finally {
      await engine.stopPcmPlayer().catch(() => {
        // Already stopped, or never started audio — nothing to undo.
      });
    }
  } finally {
    await engine.destroy().catch(() => {
      // A destroy that throws must not mask the real error below it.
    });
  }
}

/** The app's one-shot path over the real engine module. */
export async function speakKokoroOnce(options: SpeakOnceOptions): Promise<void> {
  await speakOnce(() => import("react-native-sherpa-onnx/tts"), options);
}
