import { KittenEngine } from "./engines/kitten/index.ts";
import { KokoroEngine } from "./engines/kokoro/index.ts";
import { PhononEngine, getPhononSupport } from "./engines/phonon/index.ts";
import { SupertonicEngine } from "./engines/supertonic/index.ts";
import { createSystemEngine } from "./engines/system.ts";
import type { Engine, EngineId, NeuralEngine, NeuralEngineId } from "./types.ts";

const kittenEngine = new KittenEngine();
const kokoroEngine = new KokoroEngine();
const phononEngine = new PhononEngine();
const supertonicEngine = new SupertonicEngine();
const systemEngine = createSystemEngine(() => import("expo-speech"));

const neuralEngines: Record<NeuralEngineId, NeuralEngine> = {
  kitten: kittenEngine,
  kokoro: kokoroEngine,
  supertonic: supertonicEngine,
  phonon: phononEngine,
};

const engines: Record<EngineId, Engine> = {
  ...neuralEngines,
  system: systemEngine,
};

export function getEngine(id: EngineId): Engine {
  const engine = engines[id];
  if (!engine) throw new Error(`Unknown engine id: ${id}`);
  return engine;
}

export function getNeuralEngine(id: NeuralEngineId): NeuralEngine {
  const engine = neuralEngines[id];
  if (!engine) throw new Error(`Unknown neural engine id: ${id}`);
  return engine;
}

export function getAllEngines(): Engine[] {
  return [phononEngine, kittenEngine, kokoroEngine, supertonicEngine, systemEngine];
}

export { getPhononSupport };