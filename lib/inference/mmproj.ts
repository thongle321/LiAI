/** Where the active model's projector lives (vision-series 02).
 *
 * Ticket 01 records `spec.projector` and guarantees that a "completed"
 * vision spec has the pair on disk. This module turns that record into a
 * load path — for the engine slot (per file name) and for the image gate
 * (per ACTIVE model). Remote providers never resolve one: remote vision
 * is ticket 04, and text-only stays text-only.
 *
 * Node-test-safety rule (same as store/chat/index.ts): the store and
 * expo-file-system come in through DYNAMIC imports inside try/catch, so
 * importing this module under plain node never touches native code; a
 * failed import resolves to undefined (cannot see — the honest default).
 */

import type { ModelSpec } from "../../types/models.ts";
import { resolveLocalFile } from "./engine.ts";

/** Pure decision: can the ACTIVE local model see images? (vision-series 03)
 *  True only for a completed spec that records its projector — ticket 01
 *  guarantees "completed" means the pair landed. This is the ONE rule;
 *  the path resolver, the send gate, and the composer all read it. */
export function specCanSeeImages(
  specs: ReadonlyArray<CapabilityModel>,
  activeModelId: string | null,
  providerType: "local" | "remote" | null,
): boolean {
  return (
    providerType === "local" &&
    activeModelId !== null &&
    specs.some(
      (m) =>
        m.id === activeModelId &&
        m.downloadStatus === "completed" &&
        m.projector !== undefined,
    )
  );
}

/** Pure decision: the pair's projector path, or undefined when the active
 *  setup cannot see. `downloadStatus === "completed"` is the proof the
 *  pair landed (ticket 01's sequencing) — a mid-download spec must not
 *  arm a load with a projector that isn't there. */
export function projectorPathFromSpecs(
  specs: ReadonlyArray<CapabilityModel>,
  activeModelId: string | null,
  providerType: "local" | "remote" | null,
  docsDir: string,
): string | undefined {
  if (!specCanSeeImages(specs, activeModelId, providerType)) return undefined;
  const spec = specs.find((m) => m.id === activeModelId);
  return spec?.projector
    ? resolveLocalFile(docsDir, spec.projector.name)
    : undefined;
}

/** Pure decision: can the ACTIVE REMOTE provider see images? (04)
 *  True only when the provider's /props probe recorded vision for its
 *  model — absent or false both mean cannot-see (a failed probe must
 *  not promise vision). */
export function remoteCapsCanSeeImages(
  remoteCaps: Record<string, { supportsVision?: boolean }>,
  activeModelId: string | null,
  providerType: "local" | "remote" | null,
): boolean {
  if (providerType !== "remote" || activeModelId === null) return false;
  const providerId = activeModelId.startsWith("remote-")
    ? activeModelId.slice("remote-".length)
    : activeModelId;
  return remoteCaps[providerId]?.supportsVision === true;
}

/** Everything the capability verdict reads, in one shape — the composer
 *  hook and the send gate both answer through canSeeImages, so the two
 *  surfaces cannot drift (code-review 04). */
export type CapabilityModel = Pick<
  ModelSpec,
  "id" | "downloadStatus" | "projector"
> & {
  files?: ReadonlyArray<Pick<ModelSpec["files"][number], "name">>;
};

export interface ModelCapabilityState {
  models: ReadonlyArray<CapabilityModel>;
  remoteCaps: Record<string, { supportsVision?: boolean }>;
  activeModelId: string | null;
  activeProviderType: "local" | "remote" | null;
}

/** The ONE verdict: local pair or remote probe. */
export function canSeeImages(s: ModelCapabilityState): boolean {
  return s.activeProviderType === "remote"
    ? remoteCapsCanSeeImages(s.remoteCaps, s.activeModelId, s.activeProviderType)
    : specCanSeeImages(s.models, s.activeModelId, s.activeProviderType);
}

/** The ONE dynamic-import seam for capability reads (code-review: the
 *  dance existed in three places). Node-safe: a failed import yields
 *  undefined, and every caller's answer degrades to cannot-see. */
export async function loadModelState(): Promise<
  (ModelCapabilityState & { docsDir: string }) | undefined
> {
  try {
    const [fs, models] = await Promise.all([
      import("expo-file-system/legacy"),
      import("../../store/modelStore.ts"),
    ]);
    const m = models.useModelStore.getState();
    return {
      docsDir: fs.documentDirectory ?? "",
      models: m.models,
      remoteCaps: m.remoteCaps,
      activeModelId: m.activeModelId,
      activeProviderType: m.activeProviderType,
    };
  } catch {
    return undefined;
  }
}

/** The ACTIVE local model's projector path — the image gate's answer. */
export async function activeLocalProjectorPath(): Promise<string | undefined> {
  const st = await loadModelState();
  if (!st) return undefined;
  return projectorPathFromSpecs(
    st.models,
    st.activeModelId,
    st.activeProviderType,
    st.docsDir,
  );
}

/** The projector path for the model the ENGINE is being asked to load
 *  (looked up by the file the source names, not the active pointer — the
 *  two must agree when the slot is keyed, but the slot decides by file). */
export async function projectorPathForFileName(
  fileName: string,
): Promise<string | undefined> {
  const st = await loadModelState();
  if (!st) return undefined;
  const spec = st.models.find(
    (m) => m.downloadStatus === "completed" && m.files?.[0]?.name === fileName,
  );
  return spec?.projector
    ? resolveLocalFile(st.docsDir, spec.projector.name)
    : undefined;
}
