/** Voice-pack planning: which files an engine needs and how its progress
 *  bar is weighted. Pure — no filesystem, no network, so it stays
 *  node-tested. `download.ts` owns everything that actually touches disk.
 */

import { CORE_PHASE_WEIGHT, ENGINE_VERSIONS, ENGINE_VOICE_FILES, ENGINE_CORE_FILES } from "./catalog.ts";
import { DISK_HEADROOM, ENGINE_ESTIMATED_BYTES } from "./constants.ts";
import type { CatalogFile } from "./catalog.ts";
import type { EngineId } from "./types.ts";

/** Written LAST, after every core file lands. Its absence means the install
 *  never completed, so an interrupted download cannot look installed. */
export const VERSION_SENTINEL = "model-version.json";
/** Lets the fork lazy-fetch any voice whose phase-2 file failed. */
export const LOCAL_MANIFEST = "voices-manifest.json";

/** Files an engine needs, split into the all-or-nothing core phase and the
 *  best-effort per-voice phase. */
export function planFiles(engine: EngineId): {
  core: CatalogFile[];
  voice: CatalogFile[];
} {
  return { core: ENGINE_CORE_FILES[engine], voice: ENGINE_VOICE_FILES[engine] };
}

/**
 * Weighted overall progress. The core phase owns `weight` of the bar so a
 * big core download does not read as "nearly done" while the pack is still
 * mostly missing (Kokoro 60/40, Supertonic 70/30, Kitten all-or-nothing).
 */
export function combineProgress(
  engine: EngineId,
  coreFraction: number,
  voiceFraction: number,
): number {
  const w = CORE_PHASE_WEIGHT[engine];
  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
  return clamp(w * clamp(coreFraction) + (1 - w) * clamp(voiceFraction));
}

/** Bytes the preflight demands: the estimate plus headroom. */
export function requiredBytes(engine: EngineId): number {
  return Math.ceil(ENGINE_ESTIMATED_BYTES[engine] * DISK_HEADROOM);
}

/** Whether the download may start. Unknown free space is allowed through —
 *  refusing to install because we could not read the disk would be worse
 *  than a failed download the user can retry. */
export function diskPreflightOk(freeBytes: number | null, engine: EngineId): boolean {
  if (freeBytes === null) return true;
  return freeBytes >= requiredBytes(engine);
}

/** Whether the installed pack is the CURRENT version — a version bump
 *  forces a re-download rather than loading stale files. */
export function sentinelMatches(engine: EngineId, raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    return (parsed as { version?: unknown } | null)?.version === ENGINE_VERSIONS[engine];
  } catch {
    return false;
  }
}