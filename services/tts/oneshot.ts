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

/** Minimal structural view of the streaming engine's playback surface —
 *  a subset of the real `StreamingTtsEngine`, so tests can fake it. */
export interface PcmPlaybackEngine {
  getSampleRate(): Promise<number>;
  getNumSpeakers(): Promise<number>;
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

/** Engine-creation knobs the caller resolves; kept off `SpeakOnceOptions`
 *  because they are engine setup, not per-utterance intent. Thread count
 *  IS on SpeakOnceOptions (the engine table sets it per model), so this
 *  one exists only for callers that bypass the table — tests, mostly. */
export interface EngineTuning {
  numThreads?: number;
  /** Execution provider: 'cpu' | 'nnapi' | 'coreml' | ... */
  provider?: string;
}

/** The subset of `react-native-sherpa-onnx/tts` the tracer uses. */
export interface SherpaTtsApi {
  createStreamingTTS(options: {
    modelPath: { type: "file"; path: string };
    modelType?: TTSModelType;
    numThreads?: number;
    provider?: string;
  }): Promise<PcmPlaybackEngine>;
}

export interface SpeakOnceOptions {
  /** Local model directory from the download bridge. */
  modelPath: string;
  /** sherpa model type to instantiate. `auto` lets sherpa detect it from
   *  the files on disk; the engine table passes the explicit type because
   *  detection is a fallback, not a plan. */
  modelType?: TTSModelType;
  text: string;
  /** Inference threads for this model. The engine table sets it per engine
   *  (the 15M kitten needs fewer than the diffusion model); omitted means
   *  the shared default below. */
  numThreads?: number;
  /** Speaker id; each engine's curated table is in sid order. */
  sid?: number;
  speed?: number;
  /** Speaker count the caller's curated voice table assumes. When the model
   *  reports something else we warn instead of throwing — a stale sid→name
   *  table should be visible in logs, not fatal to playback. */
  expectedSpeakers?: number;
  /** Stop path (ticket 03): aborting cancels the in-flight generation and
   *  the one-shot then RESOLVES — a stop is a clean terminal state. */
  signal?: AbortSignal;
}

/** Warn when the model's speaker count contradicts the curated voice table.
 *  A reorder would NOT be caught here — only the count — so the table's real
 *  source of truth stays sherpa's generate_voices_bin.py. This is the cheap
 *  tripwire for a model swap that changes the count out from under us. */
async function assertSpeakerCount(
  engine: PcmPlaybackEngine,
  expected: number | undefined,
  modelType: string,
): Promise<void> {
  if (expected === undefined) return;
  const actual = await engine.getNumSpeakers().catch(() => undefined);
  if (actual !== undefined && actual !== expected) {
    console.warn(
      `[tts] ${modelType} model reports ${actual} speakers but ${expected} voices are curated; the sid→name table is stale`,
    );
  }
}

/** Generate `text` from a downloaded model and play it through the native
 *  mono PCM player. Rejects on generation errors; the player is always
 *  stopped and the engine destroyed on the way out. */
export async function speakOnce(
  load: () => Promise<SherpaTtsApi>,
  options: SpeakOnceOptions,
  tuning: EngineTuning = {},
): Promise<void> {
  if (options.signal?.aborted) return;
  const api = await load();
  const modelType = options.modelType ?? "auto";
  const engine = await api.createStreamingTTS({
    modelPath: { type: "file", path: options.modelPath },
    modelType,
    ...(tuning.numThreads !== undefined
      ? { numThreads: tuning.numThreads }
      : options.numThreads !== undefined
        ? { numThreads: options.numThreads }
        : {}),
    ...(tuning.provider !== undefined ? { provider: tuning.provider } : {}),
  });
  try {
    await assertSpeakerCount(engine, options.expectedSpeakers, modelType);
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

/** Best execution provider for this device, resolved once per app run.
 *  Android: NNAPI when ONNX Runtime can actually create a session with it
 *  (sherpa's provider table: 2-4x over CPU). iOS: Core ML when an ANE is
 *  present. Otherwise CPU — sherpa's own default and the only provider
 *  guaranteed to exist. Detection failures fall back to cpu rather than
 *  failing the speak: a wrong provider is worse than a slow one. */
let providerProbe: Promise<string> | null = null;

async function detectProvider(): Promise<string> {
  try {
    const sherpa = await import("react-native-sherpa-onnx");
    const { Platform } = await import("react-native");
    if (Platform.OS === "android" && (await sherpa.getNnapiSupport())?.canInit) {
      return "nnapi";
    }
    if (
      Platform.OS === "ios" &&
      (await sherpa.getCoreMlSupport())?.hasAccelerator
    ) {
      return "coreml";
    }
  } catch {
    // Falls through to cpu below.
  }
  return "cpu";
}

function neuralProvider(): Promise<string> {
  providerProbe ??= detectProvider();
  return providerProbe;
}

/** The app's one-shot path over the real engine module, for any neural
 *  engine. The engine table carries each model's `modelType` and thread
 *  count; everything else (provider probe) is shared and resolved once. */
export async function speakNeuralOnce(options: SpeakOnceOptions): Promise<void> {
  await speakOnce(() => import("react-native-sherpa-onnx/tts"), options, {
    provider: await neuralProvider(),
  });
}
