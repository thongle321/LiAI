/** The one neural-engine shape every downloadable TTS engine shares.
 *
 * Kitten, Kokoro and Supertonic differ in exactly three things: which
 * sherpa `modelType` to instantiate, which curated voice table to answer
 * with, and how many threads to give it. Everything else — install check,
 * local path, abortable one-shot, sid derived from list position — is
 * identical, so it lives here once instead of three times.
 *
 * Deps are injected for the same node-test reason as the system engine:
 * no native module is statically imported here.
 */

import type { TTSModelType } from "react-native-sherpa-onnx/tts";

import type { TtsModelStatus } from "../download.ts";
import type { Engine, NeuralEngineId, PlayOptions, Voice } from "../types.ts";

/** The identity a neural engine is built from. `engineMeta.ts` assembles
 *  the full descriptor; this factory needs only these three fields, which
 *  is what keeps the meta table from importing back into this module. */
export interface NeuralEngineIdentity {
  id: NeuralEngineId;
  /** sherpa-onnx model type — the native engine to instantiate. */
  modelType: TTSModelType;
  /** Curated voices, in sid order. play() derives the sid from the index. */
  voices: Voice[];
  /** Inference threads this model is given; see engineMeta.ts. */
  numThreads: number;
}

export interface NeuralEngineDeps {
  /** Installed-state check for this engine's model. */
  status: () => Promise<TtsModelStatus>;
  /** Local model directory, or null when not on disk. */
  localPath: () => Promise<string | null>;
  /** Speak once through the native PCM player; resolves on end or abort. */
  speakOnce: (options: {
    modelPath: string;
    text: string;
    modelType: TTSModelType;
    numThreads?: number;
    sid?: number;
    speed?: number;
    signal?: AbortSignal;
    expectedSpeakers?: number;
  }) => Promise<void>;
}

export function createNeuralEngine(
  engine: NeuralEngineIdentity,
  deps: NeuralEngineDeps,
): Engine {
  /** Abort controller of the in-flight play; stop() aborts it and the
   *  one-shot resolves — a stop is a clean terminal state, not an error. */
  let active: AbortController | null = null;

  return {
    id: engine.id,

    async isInstalled(): Promise<boolean> {
      return (await deps.status()).state === "ready";
    },

    async getVoices() {
      return engine.voices;
    },

    async loadInto(): Promise<void> {
      // The engine instance is created per speak (cheap native teardown);
      // nothing to preload.
    },

    async play(text: string, voice: Voice, options?: PlayOptions): Promise<void> {
      const index = engine.voices.findIndex((v) => v.id === voice.id);
      if (index < 0) {
        throw new Error(`unknown ${engine.id} voice: ${voice.id}`);
      }
      // List order IS sid order; an explicit sid override wins.
      const sid = options?.sid ?? index;
      const modelPath = await deps.localPath();
      if (!modelPath) {
        throw new Error(`${engine.id} model not installed`);
      }
      const controller = new AbortController();
      active = controller;
      try {
        await deps.speakOnce({
          modelPath,
          text,
          modelType: engine.modelType,
          numThreads: engine.numThreads,
          sid,
          speed: options?.speed,
          signal: controller.signal,
          // Guards the curated table against a model that ships a different
          // speaker count; warns rather than throws (see oneshot.ts).
          expectedSpeakers: engine.voices.length,
        });
      } finally {
        if (active === controller) active = null;
      }
    },

    async stop(): Promise<void> {
      active?.abort();
    },
  };
}