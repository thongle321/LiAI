/** Kokoro neural TTS engine (ticket 03 / spec Q2, Q5, Q8).
 *
 * Composes the ticket-02 seams: install state + model path from the
 * download bridge, synthesis through the streaming-engine one-shot path
 * (the shipped PCM player lives there — spec "Findings from ticket 02",
 * open item 3). Voices are the 11 curated speakers of kokoro-int8-en-v0_19
 * (spec Q12 as revised by the findings); list order IS sid order, so
 * play() derives the sid from the voice's position.
 *
 * Deps are injected for the same node-test reason as the system engine:
 * no native module is statically imported here.
 */

import type { TtsModelStatus } from "../download.ts";
import type { Engine, PlayOptions, Voice } from "../types.ts";

/** The 11 speakers of kokoro-int8-en-v0_19, in sid order.
 *
 * Source of truth is sherpa-onnx's own voices.bin generator,
 * `scripts/kokoro/v0.19/generate_voices_bin.py`, which writes one 511x1x256
 * embedding per entry of `id2speaker` in exactly this order. Do NOT derive
 * these names from upstream Kokoro-82M: that catalog has 22 English
 * voices in a DIFFERENT order, and sherpa addresses this model by integer
 * sid, so an upstream-ordered list mislabels every voice past index 4.
 *
 * List order IS sid order — play() derives the sid from the position.
 */
const KOKORO_SPEAKERS: ReadonlyArray<{ sid: string; name: string }> = [
  { sid: "af", name: "Default" },
  { sid: "af_bella", name: "Bella" },
  { sid: "af_nicole", name: "Nicole" },
  { sid: "af_sarah", name: "Sarah" },
  { sid: "af_sky", name: "Sky" },
  { sid: "am_adam", name: "Adam" },
  { sid: "am_michael", name: "Michael" },
  { sid: "bf_emma", name: "Emma" },
  { sid: "bf_isabella", name: "Isabella" },
  { sid: "bm_george", name: "George" },
  { sid: "bm_lewis", name: "Lewis" },
];

export const KOKORO_VOICES: Voice[] = KOKORO_SPEAKERS.map((speaker) => ({
  id: speaker.sid,
  name: speaker.name,
  engine: "kokoro",
}));

export interface KokoroEngineDeps {
  /** Installed-state check for the kokoro model. */
  status: () => Promise<TtsModelStatus>;
  /** Local model directory, or null when not on disk. */
  localPath: () => Promise<string | null>;
  /** Speak once through the native PCM player; resolves on end or abort. */
  speakOnce: (options: {
    modelPath: string;
    text: string;
    sid?: number;
    speed?: number;
    signal?: AbortSignal;
    expectedSpeakers?: number;
  }) => Promise<void>;
}

export function createKokoroEngine(deps: KokoroEngineDeps): Engine {
  /** Abort controller of the in-flight play; stop() aborts it and the
   *  one-shot resolves — a stop is a clean terminal state, not an error. */
  let active: AbortController | null = null;

  return {
    id: "kokoro",

    async isInstalled(): Promise<boolean> {
      return (await deps.status()).state === "ready";
    },

    async getVoices() {
      return KOKORO_VOICES;
    },

    async loadInto(): Promise<void> {
      // The engine instance is created per speak (cheap native teardown);
      // nothing to preload.
    },

    async play(text: string, voice: Voice, options?: PlayOptions): Promise<void> {
      const index = KOKORO_VOICES.findIndex((v) => v.id === voice.id);
      if (index < 0) {
        throw new Error(`unknown kokoro voice: ${voice.id}`);
      }
      // List order IS sid order; an explicit sid override wins.
      const sid = options?.sid ?? index;
      const modelPath = await deps.localPath();
      if (!modelPath) {
        throw new Error("kokoro model not installed");
      }
      const controller = new AbortController();
      active = controller;
      try {
        await deps.speakOnce({
          modelPath,
          text,
          sid,
          speed: options?.speed,
          signal: controller.signal,
          // Guards the table above against a model that ships a different
          // speaker count; warns rather than throws.
          expectedSpeakers: KOKORO_VOICES.length,
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
