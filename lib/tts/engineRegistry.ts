/** TTS engine registry (ticket 03 / spec Q2, Q5, Q15a).
 *
 * Static registry in the pocketpal shape: one engine instance per id,
 * neural-first order. The wiring constructs the engines over their real
 * native modules through dynamic imports, so this module stays node-safe
 * for tests (no expo-speech / sherpa-onnx import is ever evaluated in
 * node).
 */

import { ttsDownloads } from "./download.ts";
import { KOKORO_EN_MODEL_ID, speakKokoroOnce } from "./oneshot.ts";
import { createKokoroEngine } from "./engines/kokoro.ts";
import { createSystemEngine } from "./engines/system.ts";
import type { Engine, EngineId } from "./types.ts";

const engines: Record<EngineId, Engine> = {
  kokoro: createKokoroEngine({
    status: () => ttsDownloads.status(KOKORO_EN_MODEL_ID),
    localPath: () => ttsDownloads.localPath(KOKORO_EN_MODEL_ID),
    speakOnce: (options) => speakKokoroOnce(options),
  }),
  system: createSystemEngine({
    load: () => import("expo-speech"),
  }),
};

export function getEngine(id: EngineId): Engine {
  const engine = engines[id];
  if (!engine) {
    throw new Error(`Unknown engine id: ${id}`);
  }
  return engine;
}

/** Render order: kokoro (downloadable neural) first, system last — the
 *  no-download default sits at the bottom of the picker (spec Q15a). */
export function getAllEngines(): Engine[] {
  return [engines.kokoro, engines.system];
}
