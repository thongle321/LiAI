/** Vision heal + the projection cleanup queue.
 *
 * PocketPal parity (`pocketpal-ai/src/store/ModelStore.ts:699`):
 * `healDraftVisionClassification()` re-derives the vision classification of
 * the models the pairing heuristic misfiled — a draft repository carries an
 * mmproj, so it was classified as vision-capable and the app downloaded a
 * projector a draft can never use — and `drainPendingProjectionCleanup()`
 * deletes the projector that misclassification fetched.
 *
 * Two shapes differ from the reference, both forced by LiAI's model record:
 *  - The queue holds projector FILE NAMES, not model ids. LiAI's projector
 *    is an inline record on the model (`ModelSpec.projector`), not a
 *    first-class model row, so there is no model id to point at.
 *  - A projector still paired with ANY model is left alone. Two LLMs of one
 *    repository can share one mmproj, and deleting it would blind the model
 *    that still needs it.
 */

import type { StateCreator } from "zustand";

import type { ModelSpec } from "@/types/models";
import type { KeyValueStorage } from "@/services/storage/storage";
import { isDraftOnlySpec } from "@/utils/draft-only.ts";
import { modelsUsingProjector } from "@/services/models/vision-pairing.ts";
import { asyncStorage, PENDING_PROJECTION_CLEANUP_KEY } from "./storage.ts";
import type { ModelStore, VisionHealSlice } from "./types.ts";

/** The device operations the cleanup needs, injected so the slice is
 *  testable without a native file system. */
export interface ProjectionCleanupDeps {
  /** Delete the projector file from the models directory. Throws on failure. */
  deleteProjectorFile: (name: string) => Promise<void>;
  /** Is the projector file still on disk? */
  projectorFileExists: (name: string) => Promise<boolean>;
  /** Is a download of that file in flight right now? */
  isDownloading: (name: string) => Promise<boolean>;
  /** Where the queue is persisted. */
  storage: KeyValueStorage;
}

/** Every downloaded projector lives in the models directory.
 *
 *  Throws when there is no document directory: a relative path would point
 *  at the wrong place, and deleting by a relative path is not a thing this
 *  app may do. The drain catches it and keeps the file queued. */
function projectorPath(fs: { documentDirectory?: string | null }, name: string): string {
  const root = fs.documentDirectory;
  if (!root) {
    throw new Error("No document directory: the projector cannot be located.");
  }
  return `${root}models/${name}`;
}

/** The production dependencies.
 *
 *  The file system and the download service are reached by DYNAMIC import,
 *  for the reason store/models/catalog.ts loads its file system on demand:
 *  a native module at the top level makes the slice unloadable outside a
 *  device, and Jest's CommonJS runtime cannot execute a dynamic import at
 *  all. */
export const defaultVisionHealDeps: ProjectionCleanupDeps = {
  deleteProjectorFile: async (name) => {
    const fs = await import("expo-file-system/legacy");
    await fs.deleteAsync(projectorPath(fs, name), { idempotent: true });
  },
  projectorFileExists: async (name) => {
    const fs = await import("expo-file-system/legacy");
    const info = await fs.getInfoAsync(projectorPath(fs, name));
    return info.exists;
  },
  isDownloading: async (name) => {
    const { getDownloadService } = await import("./downloads.ts");
    return getDownloadService()
      .getAllJobs()
      .some((job) => job.fileName === name && job.status === "downloading");
  },
  storage: asyncStorage,
};

/** Does this spec need healing?
 *
 *  Two gates, and one of them is a wait:
 *  - It claims vision. A draft is only ever wrong about vision, and a model
 *    that never claimed it has nothing to heal.
 *  - We can tell it is a draft. The GGUF header is authoritative, so a
 *    DOWNLOADED model whose header has not been read yet is SKIPPED: the
 *    backfill may be about to say "this is a chat model", and a filename
 *    guess must never overrule a header we have not seen. */
export function shouldHealDraftVision(spec: ModelSpec): boolean {
  if (spec.supportsVision !== true) return false;
  if (spec.downloadStatus === "completed" && !spec.ggufMetadata) return false;
  return isDraftOnlySpec(spec);
}

/** The heal as a plan: the models it would write, and the projector files it
 *  would queue. Pure — the slice is the shell around it. */
export function planVisionHeal(models: ModelSpec[]): {
  models: ModelSpec[];
  queue: string[];
  changed: boolean;
} {
  const queue: string[] = [];
  let changed = false;
  const healed = models.map((spec) => {
    if (!shouldHealDraftVision(spec)) return spec;
    changed = true;
    // The projector the misclassification downloaded: it is orphaned now.
    if (spec.projector) queue.push(spec.projector.name);
    return {
      ...spec,
      // FALSE, not undefined: utils/model-upgrade.ts re-infers
      // supportsVision from "has a projector or is a vision row" when the
      // field is absent, so an absent value would be undone on the next
      // launch and the model would claim vision again.
      supportsVision: false,
      // The same for visionEnabled: absent means ON.
      visionEnabled: false,
      capabilities: spec.capabilities?.filter((c) => c !== "vision"),
      projector: undefined,
      projectorCandidates: undefined,
    };
  });
  return { models: healed, queue, changed };
}

/** Delete the orphaned projector files, and say which ones are still owed.
 *
 *  Runs on every launch: a name stays queued while its download is still in
 *  flight or its deletion failed, so a kill or an unfinished mmproj
 *  download cannot strand the file forever. */
export async function drainProjectionCleanup(
  queue: string[],
  models: ModelSpec[],
  deps: ProjectionCleanupDeps,
): Promise<string[]> {
  const remaining: string[] = [];
  for (const name of queue) {
    // Still paired with a model: legitimately shared, never deleted.
    if (modelsUsingProjector(models, name).length > 0) continue;
    try {
      // A download in flight keeps the file: deleting it now would pull it
      // out from under the transfer.
      if (await deps.isDownloading(name)) {
        remaining.push(name);
        continue;
      }
      // Nothing on disk: nothing to clean up.
      if (!(await deps.projectorFileExists(name))) continue;
      await deps.deleteProjectorFile(name);
      // The file survived the delete: keep it queued and try again later.
      if (await deps.projectorFileExists(name)) remaining.push(name);
    } catch {
      // A failed delete retries next launch. The file is harmless until
      // then: nothing loads it any more.
      remaining.push(name);
    }
  }
  return remaining;
}

/** The persisted queue, or an empty one.
 *
 *  A corrupt payload is not a reason to leave orphan files on the device
 *  forever — the queue is a to-do list, not a record of truth. */
export function parseProjectionCleanupQueue(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (name): name is string => typeof name === "string" && name !== "",
    );
  } catch {
    return [];
  }
}

export function createVisionHealSlice(
  deps: ProjectionCleanupDeps = defaultVisionHealDeps,
): StateCreator<ModelStore, [], [], VisionHealSlice> {
  return (set, get) => ({
    pendingProjectionCleanup: [],

    healDraftVisionClassification: async () => {
      const plan = planVisionHeal(get().models);
      if (!plan.changed) return;
      const queue = new Set(get().pendingProjectionCleanup);
      for (const name of plan.queue) queue.add(name);
      set({
        models: plan.models,
        pendingProjectionCleanup: [...queue],
      });
      // One write for the queue, one for the catalog — in THAT order.
      //
      // The queue first, because a kill between the two writes must not
      // orphan a file: a file with no owner and no queue entry is never
      // cleaned up again. With the queue written first, the worst case is
      // a queue entry whose model still has its pairing — and the next
      // launch re-runs the heal, which heals the model and keeps the
      // entry. The drain runs after both writes, so it never sees a
      // pairing the heal has not undone.
      await get().savePendingProjectionCleanup();
      await get().saveModels();
    },

    drainPendingProjectionCleanup: async () => {
      const queue = get().pendingProjectionCleanup;
      if (queue.length === 0) return;
      const remaining = await drainProjectionCleanup(
        queue,
        get().models,
        deps,
      );
      set({ pendingProjectionCleanup: remaining });
      await get().savePendingProjectionCleanup();
    },

    savePendingProjectionCleanup: async () => {
      try {
        await deps.storage.setItem(
          PENDING_PROJECTION_CLEANUP_KEY,
          JSON.stringify(get().pendingProjectionCleanup),
        );
      } catch (e) {
        console.warn("Failed to save the projection cleanup queue:", e);
      }
    },
  });
}
