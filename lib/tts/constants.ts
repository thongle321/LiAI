import type { EngineId, SupertonicSteps } from "./types.ts";

/** Spoken when the user taps Preview on a voice. */
export const TTS_PREVIEW_SAMPLE =
  "Oh, hello there! I've been waiting for you to test me. I sound pretty good!";

export const DEFAULT_SUPERTONIC_STEPS: SupertonicSteps = 5;
export const SUPERTONIC_STEP_CHOICES: SupertonicSteps[] = [1, 2, 3, 5, 10, 20];

/** Supertonic language codes; `na` is Auto (language-agnostic). */
export const SUPERTONIC_LANGUAGES: string[] = [
  "na",
  "ar", "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el",
  "hi", "hu", "id", "it", "ja", "ko", "lv", "lt", "pl", "pt", "ro", "ru",
  "sk", "sl", "es", "sv", "tr", "uk", "vi",
];
export const DEFAULT_SUPERTONIC_LANGUAGE = "na";

/**
 * Byte estimates for the free-space preflight and the header readout.
 * Exact values, not rounded — PocketPal's numbers, which match the real
 * manifest sizes. Supertonic is a measured total, not a round figure.
 */
export const ENGINE_ESTIMATED_BYTES: Record<EngineId, number> = {
  system: 0,
  kitten: 57 * 1024 * 1024,
  kokoro: 330 * 1024 * 1024,
  supertonic: 398_352_949,
};

/** Headroom multiplier for the disk preflight (PocketPal parity). */
export const DISK_HEADROOM = 1.2;

/** Display metadata for an engine row. RAM figures are PocketPal's measured
 *  peaks, rounded to the nearest 50 MB. `badge` is our own wording, per the
 *  Voice settings reference — not PocketPal's. */
export interface EngineMeta {
  title: string;
  badge: string;
  /** Distinct-voice count for the engine's catalogue. */
  voices: number;
  ramMb: number;
  /** Engines the user can download. */
  downloadable: boolean;
}

export const ENGINE_META: Record<EngineId, EngineMeta> = {
  system: { title: "System voice", badge: "DEFAULT", voices: 0, ramMb: 0, downloadable: false },
  kitten: { title: "Kitten", badge: "LIGHTWEIGHT", voices: 8, ramMb: 350, downloadable: true },
  kokoro: { title: "Kokoro", badge: "NATURAL", voices: 22, ramMb: 640, downloadable: true },
  supertonic: { title: "Supertonic", badge: "FAST START", voices: 10, ramMb: 670, downloadable: true },
};

/** Engines offered in the "Downloadable engines" list, in display order. */
export const DOWNLOADABLE_ENGINES: EngineId[] = ["kitten", "kokoro", "supertonic"];