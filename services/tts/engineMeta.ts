/** The downloadable-engine table (spec Q2 — reversed 2026-10-14).
 *
 * One descriptor per engine card: what it is called, how it is tiered, the
 * sherpa model it downloads, and the curated voices it answers with. Both
 * the store (model id, install state) and the UI (title, badge, spec line)
 * read from here, so a card and its download can never disagree about
 * which model backs them.
 *
 * SIZES ARE MEASURED, NOT INVENTED. `modelBytes` is the archive size in
 * sherpa-onnx's `tts-models` release for the exact id named here, and the
 * spec line is formatted from it at module load. The reference design's
 * numbers (22 voices · 330 MB) describe PocketPal's DIFFERENT kokoro model
 * (`onnx-community/Kokoro-82M-v1.0-ONNX`, fp32, per-voice .bin files), so
 * copying them would promise a download this app does not make.
 *
 * RAM figures are deliberately absent: the reference's peak-RAM numbers
 * were measured on its authors' hardware. A number we have not measured on
 * ours does not belong in a spec line.
 */

import { formatBytes } from "../models/progress.ts";
import { KITTEN_VOICES } from "./engines/kitten/voices.ts";
import { KOKORO_VOICES } from "./engines/kokoro/voices.ts";
import { SUPERTONIC_VOICES } from "./engines/supertonic/voices.ts";
import { PHONON_VOICES } from "./engines/phonon/voices.ts";
import {
  KITTEN_MODEL_ESTIMATED_BYTES,
  KOKORO_MODEL_ESTIMATED_BYTES,
  SUPERTONIC_MODEL_ESTIMATED_BYTES,
  PHONON_MODEL_ESTIMATED_BYTES,
} from "./constants.ts";
import type { NeuralEngineId, Voice } from "./types.ts";

export interface EngineMeta {
  id: NeuralEngineId;
  title: string;
  /** Tier chip: LIGHTWEIGHT / NATURAL / FAST START. */
  badge: string;
  /** The warm chip is Kitten's alone, per the design: it is the pack a
   *  low-end device reaches for, and the one chip that has to shout. */
  warmBadge: boolean;
  /** "N voices · 99 MB" — the N is the table length, the size is measured. */
  spec: string;
  /** One line on what this engine is FOR, shown in the expanded body. */
  tagline: string;
  /** Registry id in sherpa-onnx's `tts-models` GitHub release. Only for
   *  sherpa-based engines; Phonon manages its own files. */
  modelId?: string;
  /** Archive size in bytes: drives the low-disk preflight and the spec line. */
  modelBytes: number;
  /** sherpa-onnx model type, and the native engine this instantiates. Only
   *  for sherpa-based engines; Phonon is a different native module. */
  modelType?: string;
  /** Inference threads. Only for sherpa-based engines. */
  numThreads?: number;
  /** Curated voices, in sid order. */
  voices: Voice[];
}

/** The design's card order: lightest first, so the list reads as a ladder
 *  of cost rather than an alphabet. */
export const ENGINE_ORDER: readonly NeuralEngineId[] = [
  "kitten",
  "kokoro",
  "supertonic",
  "phonon",
];

function describe(voices: Voice[], modelBytes: number): string {
  // The app's own formatter and units (decimal MB), so a voice-pack size
  // reads the same as every other size on every other screen. The reference
  // design prints MiB values labelled "MB"; matching its label while using
  // different arithmetic would be worse than either.
  return `${voices.length} voices · ${formatBytes(modelBytes, 1)}`;
}

const TABLE: Record<NeuralEngineId, Omit<EngineMeta, "spec">> = {
  kitten: {
    id: "kitten",
    title: "Kitten",
    badge: "LIGHTWEIGHT",
    warmBadge: true,
    tagline: "Smallest footprint. Reliable. Best on older devices.",
    modelBytes: KITTEN_MODEL_ESTIMATED_BYTES,
    voices: KITTEN_VOICES,
  },
  kokoro: {
    id: "kokoro",
    title: "Kokoro",
    badge: "NATURAL",
    warmBadge: false,
    tagline: "Highest quality. Slower to start. Some voices may not work on all devices.",
    modelBytes: KOKORO_MODEL_ESTIMATED_BYTES,
    voices: KOKORO_VOICES,
  },
  supertonic: {
    id: "supertonic",
    title: "Supertonic",
    badge: "FAST START",
    // Warm chip is Kitten's alone (see EngineMeta.warmBadge).
    warmBadge: false,
    tagline: "Fastest to start. Uses more RAM. May occasionally drop words.",
    modelBytes: SUPERTONIC_MODEL_ESTIMATED_BYTES,
    voices: SUPERTONIC_VOICES,
  },
  phonon: {
    id: "phonon",
    title: "Phonon",
    badge: "LIGHTWEIGHT",
    warmBadge: false,
    tagline: "Fast startup, low memory. English only.",
    modelBytes: PHONON_MODEL_ESTIMATED_BYTES,
    voices: PHONON_VOICES,
  },
};

export const NEURAL_ENGINE_META: Record<NeuralEngineId, EngineMeta> = Object.fromEntries(
  ENGINE_ORDER.map((id) => {
    const meta = TABLE[id];
    return [id, { ...meta, spec: describe(meta.voices, meta.modelBytes) }];
  }),
) as Record<NeuralEngineId, EngineMeta>;

/** Total bytes the three engines would occupy if every one were installed.
 *  Feeds the low-disk preflight; the reference design's equivalent line is
 *  a static "1.2 GB available" caption, which this replaces with a real
 *  reading (see useFreeSpacePoll). */
export function totalEngineBytes(): number {
  return ENGINE_ORDER.reduce((sum, id) => sum + NEURAL_ENGINE_META[id].modelBytes, 0);
}