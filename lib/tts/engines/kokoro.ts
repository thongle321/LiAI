/** Kokoro neural TTS engine (ticket 03 / spec Q2, Q5, Q8).
 *
 * The NATURAL pack: `kokoro-int8-en-v0_19`, a 98.5 MiB int8 English model
 * in sherpa-onnx's `tts-models` release. Voices are the 11 speakers of that
 * model; list order IS sid order, so play() derives the sid from position.
 *
 * The engine body is the shared `createNeuralEngine`, driven by this
 * table's entry in lib/tts/engineMeta.ts — so all that is left here is the
 * voice table, the one thing a model id cannot tell you.
 */

/** The 11 speakers of kokoro-int8-en-v0_19, in sid order.
 *
 * Source of truth is sherpa-onnx's own voices.bin generator,
 * `scripts/kokoro/v0.19/generate_voices_bin.py`, which writes one 511x1x256
 * embedding per entry of `id2speaker` in exactly this order. Do NOT derive
 * these names from upstream Kokoro-82M: that catalog has 22 English
 * voices in a DIFFERENT order, and sherpa addresses this model by integer
 * sid, so an upstream-ordered list mislabels every voice past index 4.
 *
 * List order IS sid order — the factory derives the sid from the position.
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

export const KOKORO_VOICES = [
  ...KOKORO_SPEAKERS.map((speaker) => ({
    id: speaker.sid,
    name: speaker.name,
    engine: "kokoro" as const,
  })),
];