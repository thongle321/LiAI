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

/** Pure decision: the pair's projector path, or undefined when the active
 *  setup cannot see. `downloadStatus === "completed"` is the proof the
 *  pair landed (ticket 01's sequencing) — a mid-download spec must not
 *  arm a load with a projector that isn't there. */
export function projectorPathFromSpecs(
  specs: ReadonlyArray<
    Pick<ModelSpec, "id" | "downloadStatus" | "projector">
  >,
  activeModelId: string | null,
  providerType: "local" | "remote" | null,
  docsDir: string,
): string | undefined {
  if (providerType !== "local" || activeModelId === null) return undefined;
  const spec = specs.find((m) => m.id === activeModelId);
  if (!spec || spec.downloadStatus !== "completed" || !spec.projector) {
    return undefined;
  }
  return resolveLocalFile(docsDir, spec.projector.name);
}

/** The ACTIVE local model's projector path — the image gate's answer. */
export async function activeLocalProjectorPath(): Promise<string | undefined> {
  try {
    const [fs, models] = await Promise.all([
      import("expo-file-system/legacy"),
      import("../../store/modelStore.ts"),
    ]);
    const m = models.useModelStore.getState();
    return projectorPathFromSpecs(
      m.models,
      m.activeModelId,
      m.activeProviderType,
      fs.documentDirectory ?? "",
    );
  } catch {
    return undefined;
  }
}

/** The projector path for the model the ENGINE is being asked to load
 *  (looked up by the file the source names, not the active pointer — the
 *  two must agree when the slot is keyed, but the slot decides by file). */
export async function projectorPathForFileName(
  fileName: string,
): Promise<string | undefined> {
  try {
    const [fs, models] = await Promise.all([
      import("expo-file-system/legacy"),
      import("../../store/modelStore.ts"),
    ]);
    const spec = models.useModelStore
      .getState()
      .models.find(
        (m) =>
          m.downloadStatus === "completed" && m.files[0]?.name === fileName,
      );
    return spec?.projector
      ? resolveLocalFile(fs.documentDirectory ?? "", spec.projector.name)
      : undefined;
  } catch {
    return undefined;
  }
}
