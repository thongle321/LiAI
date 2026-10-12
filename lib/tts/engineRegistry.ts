import { SystemEngine } from "./engines/system.ts";
import type { Engine, EngineId } from "./types.ts";

/** Neural engines land in step 4 (download path); System ships first. */
const engines: Partial<Record<EngineId, Engine>> = {
  system: new SystemEngine(),
};

export function getEngine(id: EngineId): Engine {
  const engine = engines[id];
  if (!engine) throw new Error(`tts engine not available: ${id}`);
  return engine;
}

export function hasEngine(id: EngineId): boolean {
  return engines[id] != null;
}

/** Engine ids with an implementation, in UI display order. */
export function availableEngineIds(): EngineId[] {
  return Object.keys(engines) as EngineId[];
}