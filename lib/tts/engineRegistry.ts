/** TTS engine registry (ticket 03 / spec Q2, Q5, Q15a).
 *
 * Static registry in the pocketpal shape: one engine instance per id, the
 * downloadable neural engines first in card order, the no-download system
 * default last. The wiring constructs the engines over their real native
 * modules through dynamic imports, so this module stays node-safe for
 * tests (no expo-speech / sherpa-onnx import is ever evaluated in node).
 *
 * The per-engine model ids come from `engineMeta.ts` — the same table the
 * cards read their title, badge and size from, so a card and its download
 * cannot drift apart.
 */

import { ttsDownloads } from "./download.ts";
import { speakNeuralOnce } from "./oneshot.ts";
import { createNeuralEngine, type NeuralEngineDeps } from "./engines/neural.ts";
import { createSystemEngine } from "./engines/system.ts";
import { ENGINE_ORDER, NEURAL_ENGINE_META } from "./engineMeta.ts";
import type { Engine, EngineId, NeuralEngineId } from "./types.ts";

/** The download + synthesis seams every neural engine is built over. */
function neuralDeps(id: NeuralEngineId): NeuralEngineDeps {
  const { modelId } = NEURAL_ENGINE_META[id];
  return {
    status: () => ttsDownloads.status(modelId),
    localPath: () => ttsDownloads.localPath(modelId),
    speakOnce: speakNeuralOnce,
  };
}

const engines: Record<EngineId, Engine> = {
  // One factory, driven by the table: model type, thread count and voice
  // list all come from the same row the cards render.
  ...(Object.fromEntries(
    ENGINE_ORDER.map((id) => [
      id,
      createNeuralEngine(NEURAL_ENGINE_META[id], neuralDeps(id)),
    ]),
  ) as Record<NeuralEngineId, Engine>),
  system: createSystemEngine(() => import("expo-speech")),
};

export function getEngine(id: EngineId): Engine {
  const engine = engines[id];
  if (!engine) {
    throw new Error(`Unknown engine id: ${id}`);
  }
  return engine;
}

/** Render order: the downloadable engines in card order (lightest first),
 *  then system last — the no-download default sits at the bottom of the
 *  picker (spec Q15a). */
export function getAllEngines(): Engine[] {
  return [...ENGINE_ORDER.map((id) => engines[id]), engines.system];
}