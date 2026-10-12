/** Voice-pack catalog: where each engine's model files and voices come from.
 *
 * Exact URLs, file names and byte estimates — PocketPal parity, so a pack
 * downloaded here is byte-identical to one downloaded there. The `.bin` IPA
 * phonemizer dict is fetched by Kokoro and Kitten (Supertonic needs none);
 * it is espeak-ng-DERIVED DATA on HuggingFace, so its data licence is a
 * call for us, not for this file.
 */

import type { EngineId, Voice } from "./types.ts";

const HF = "https://huggingface.co";
const DICT_URL = `${HF}/datasets/palshub/phonemizer-dicts/resolve/main/en-us.bin`;
export const TTS_DICT_FILENAME = "en-us.bin";

export interface CatalogFile {
  /** Name on disk inside the engine directory. */
  name: string;
  url: string;
}

/** af_bella -> "Bella"; expr-voice-2-f -> "expr-voice-2-f". */
export function voiceName(id: string): string {
  const bare = id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

function voices(engine: EngineId, ids: string[], language?: string): Voice[] {
  return ids.map((id) => ({
    id,
    name: voiceName(id),
    engine,
    ...(language !== undefined ? { language } : {}),
  }));
}

const KITTEN_BASE = `${HF}/palshub/kitten-tts-nano-0.8-fp32/resolve/main`;
const KOKORO_BASE = `${HF}/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main`;
const SUPERTONIC_BASE = `${HF}/Supertone/supertonic-3/resolve/main`;

export const KITTEN_VOICE_IDS = [
  "expr-voice-2-f", "expr-voice-3-f", "expr-voice-4-f", "expr-voice-5-f",
  "expr-voice-2-m", "expr-voice-3-m", "expr-voice-4-m", "expr-voice-5-m",
];
export const KOKORO_VOICE_IDS = [
  "af_heart", "af_bella", "af_nicole", "af_sarah", "af_sky", "af_aoede",
  "af_jessica", "af_kore", "af_river", "am_adam", "am_echo", "am_eric",
  "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_santa", "bf_alice",
  "bf_emma", "bf_lily", "bm_george", "bm_lewis",
];
export const SUPERTONIC_VOICE_IDS = [
  "F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5",
];

export const ENGINE_VOICES: Record<EngineId, Voice[]> = {
  system: [],
  kitten: voices("kitten", KITTEN_VOICE_IDS, "en-US"),
  kokoro: voices("kokoro", KOKORO_VOICE_IDS, "en-US"),
  supertonic: voices("supertonic", SUPERTONIC_VOICE_IDS),
};

/** Phase 1 — all-or-nothing. A failure here deletes the engine dir. */
export const ENGINE_CORE_FILES: Record<EngineId, CatalogFile[]> = {
  system: [],
  kitten: [
    { name: "kitten.onnx", url: `${KITTEN_BASE}/kitten_tts_nano_v0_8.onnx` },
    { name: "voices-manifest.json", url: `${KITTEN_BASE}/voices-manifest.json` },
    { name: TTS_DICT_FILENAME, url: DICT_URL },
  ],
  kokoro: [
    { name: "model_fp32.onnx", url: `${KOKORO_BASE}/onnx/model.onnx` },
    { name: "tokenizer.json", url: `${KOKORO_BASE}/tokenizer.json` },
    { name: TTS_DICT_FILENAME, url: DICT_URL },
  ],
  supertonic: [
    { name: "duration_predictor.onnx", url: `${SUPERTONIC_BASE}/onnx/duration_predictor.onnx` },
    { name: "text_encoder.onnx", url: `${SUPERTONIC_BASE}/onnx/text_encoder.onnx` },
    { name: "vector_estimator.onnx", url: `${SUPERTONIC_BASE}/onnx/vector_estimator.onnx` },
    { name: "vocoder.onnx", url: `${SUPERTONIC_BASE}/onnx/vocoder.onnx` },
    { name: "unicode_indexer.json", url: `${SUPERTONIC_BASE}/onnx/unicode_indexer.json` },
  ],
};

/** Phase 2 — best-effort. A failure only costs that one voice. */
export const ENGINE_VOICE_FILES: Record<EngineId, CatalogFile[]> = {
  system: [],
  kitten: [],
  kokoro: KOKORO_VOICE_IDS.map((id) => ({
    name: `${id}.bin`,
    url: `${KOKORO_BASE}/voices/${id}.bin`,
  })),
  supertonic: SUPERTONIC_VOICE_IDS.map((id) => ({
    name: `${id}.json`,
    url: `${SUPERTONIC_BASE}/voice_styles/${id}.json`,
  })),
};

/** Share of the progress bar owned by the core phase. Rest is phase 2. */
export const CORE_PHASE_WEIGHT: Record<EngineId, number> = {
  system: 0,
  kitten: 1,
  kokoro: 0.6,
  supertonic: 0.7,
};

/** Written LAST, after every core file lands, is `VERSION_SENTINEL`; the
 *  fork's lazy-fetch list is `LOCAL_MANIFEST`. Both are owned by packPlan.ts
 *  so there is one source of truth for what marks an install complete. */
/** Bumped when a pack's file set changes, forcing a re-download. */
export const ENGINE_VERSIONS: Record<EngineId, number> = {
  system: 0,
  kitten: 1,
  kokoro: 1,
  supertonic: 3,
};