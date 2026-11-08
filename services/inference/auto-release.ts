/** Remember the model the app auto-released, so the next launch can warm it.
 *
 * The background release in `offload.ts` frees a multi-GB GGUF when the app
 * goes to the background. Without a record of that, the next launch starts
 * cold: the user waits for a multi-gigabyte read before the first token.
 *
 * PocketParity: PocketPal keeps `wasAutoReleased` + `lastAutoReleasedModelId`
 * (ModelStore.ts:1127 markAutoReleased, :1140 clearAutoReleaseFlags, :1148
 * checkAndReloadAutoReleasedModel) and reloads the model on the next launch
 * (ModelStore.ts:850). Ours keeps ONE id instead of two flags — a null id IS
 * "nothing was auto-released" — and clears it once the model is back, like
 * PocketPal's `clearAutoReleaseFlags()` after a successful load.
 *
 * The decision is a pure function and the effectful wrappers take their
 * collaborators as parameters, so the rules can be read and tested without
 * the stores or a device.
 */

/** How long the warm-up may hold the splash.
 *
 * PocketPal waits for the load however long it takes. A model that never
 * finishes loading would then hold the app closed forever, so the wait is
 * bounded: the load keeps running, the app opens anyway, and the first
 * message finds a warm engine if it got there in time. */
export const AUTO_RELEASE_RELOAD_TIMEOUT_MS = 120_000;

/** How long the record may hold the free of the engine.
 *
 * The record has to reach the disk before the process can be killed, but the
 * free is what keeps a multi-gigabyte model from being a memory problem in
 * the background. So the record is written, and the free happens as soon as
 * the write settles — or after this bound, if the storage never answers. */
export const AUTO_RELEASE_RECORD_TIMEOUT_MS = 250;

/** The model the app would load right now. */
export interface AutoReleaseActive {
  modelId: string | null;
  providerType: "local" | "remote" | null;
  /** Is the active model's file on disk? */
  downloaded: boolean;
}

/** What the restore should do with the persisted id. */
export type AutoReleaseDecision = "none" | "clear" | "reload";

/** Should the persisted id produce a warm-up load?
 *
 * "none"   — nothing was auto-released; leave the flag alone.
 * "clear"  — the flag cannot be honoured (the model is gone, another one is
 *            active, or the provider is remote); drop it without loading.
 * "reload" — warm this model up.
 *
 * Only the ACTIVE model can be warmed: the engine holds one slot, keyed on
 * the active model, so reloading any other id would load the wrong file. */
export function decideAutoRelease(input: {
  releasedModelId: string | null;
  active: AutoReleaseActive;
}): AutoReleaseDecision {
  if (!input.releasedModelId) return "none";
  if (input.releasedModelId !== input.active.modelId) return "clear";
  // A remote provider has no local engine to restore.
  if (input.active.providerType !== "local") return "clear";
  // The file is gone — there is nothing to load.
  if (!input.active.downloaded) return "clear";
  return "reload";
}

/** The collaborators the three actions need. Injected so the rules above
 * can be exercised without the stores. */
export interface AutoReleaseDeps {
  /** The persisted id of the model this app auto-released, or null. */
  readReleasedModelId: () => Promise<string | null>;
  /** Persist the id; null clears it. */
  writeReleasedModelId: (id: string | null) => Promise<void>;
  /** The model the app would load right now. */
  readActive: () => Promise<AutoReleaseActive>;
  /** Load the local engine now. Rejects when the load fails.
   *  If `modelId` is provided, reloads that SPECIFIC model (used by
   *  auto-release restore). Verifies the model is still active inside the
   *  mutex before switching (PocketParity: pendingModelId check). */
  reloadEngine: (modelId?: string) => Promise<void>;
}

/** Record the model we are about to free.
 *
 * A remote provider is skipped: there is no local engine to restore, so a
 * flag naming it would only produce a pointless load attempt later.
 *
 * Never rejects, and bounded: the caller frees the engine as soon as this
 * settles, and a storage that never answers must not keep a multi-GB model
 * alive in the background. */
export async function markAutoReleased(
  deps: AutoReleaseDeps,
  timeoutMs: number = AUTO_RELEASE_RECORD_TIMEOUT_MS,
): Promise<void> {
  try {
    const active = await deps.readActive();
    if (active.providerType !== "local") return;
    if (!active.modelId) return;
    await settleWithin(deps.writeReleasedModelId(active.modelId), timeoutMs);
  } catch (e) {
    console.warn("[auto-release] could not record the release:", e);
  }
}

/** Forget the auto-release: the model is back, or it was never ours.
 *
 * Never rejects: the flag is a convenience, and a failed write must not
 * break the restore it belongs to. */
export async function clearAutoReleased(deps: AutoReleaseDeps): Promise<void> {
  try {
    await deps.writeReleasedModelId(null);
  } catch (e) {
    console.warn("[auto-release] could not clear the auto-release record:", e);
  }
}

/** Warm the model back up after a restart.
 *
 * Never rejects: a failed load is the next turn's problem, and the app must
 * open either way.
 *
 * The flag survives a load that FAILED — the failure may be transient (a
 * locked file, a busy GPU) and the next launch gets another try, which is
 * what PocketPal does too: its `clearAutoReleaseFlags()` sits after the
 * load, so a throw skips it (ModelStore.ts:1148). A load that merely ran out
 * of time does clear it: the app opened without the model, and the next
 * launch must not hold the splash for the same wait again. */
export async function restoreAutoReleasedModel(
  deps: AutoReleaseDeps,
  timeoutMs: number = AUTO_RELEASE_RELOAD_TIMEOUT_MS,
): Promise<void> {
  let releasedModelId: string | null = null;
  try {
    releasedModelId = await deps.readReleasedModelId();
  } catch (e) {
    console.warn("[auto-release] could not read the auto-release record:", e);
    return;
  }
  if (!releasedModelId) return;

  let decision: AutoReleaseDecision;
  try {
    decision = decideAutoRelease({
      releasedModelId,
      active: await deps.readActive(),
    });
  } catch (e) {
    console.warn("[auto-release] could not read the active model:", e);
    return;
  }
  // The flag cannot be honoured: the model is gone, another one is active,
  // or the provider is remote. Drop it without loading.
  if (decision === "clear") {
    await clearAutoReleased(deps);
    return;
  }
  if (decision !== "reload") return;

  let settled: boolean;
  try {
    // Pass the released model ID so the reload verifies it's still the
    // active model inside the mutex (PocketParity: pendingModelId check).
    settled = await settleWithin(deps.reloadEngine(releasedModelId), timeoutMs);
  } catch (e) {
    // The load failed. The flag stays: the next launch gets another try.
    console.warn("[auto-release] warm-up load failed:", e);
    return;
  }
  if (!settled) {
    console.warn(
      "[auto-release] the warm-up load did not finish in time; the app opens anyway",
    );
  }
  // The model is back, so the flag has done its job.
  await clearAutoReleased(deps);
}

/** Await `promise`, but give up after `ms`.
 *
 * Resolves true when the promise settled first, false on a timeout. A
 * rejection propagates — the caller decides what a failed load means. The
 * load itself is NOT cancelled: it keeps running, and the first message
 * finds a warm engine if it got there in time. */
function settleWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** The persisted last-used model id (or null). */
export interface LastUsedDeps {
  /** Read the persisted last-used model id. */
  readLastUsedModelId: () => Promise<string | null>;
  /** Persist the last-used model id; null clears it. */
  writeLastUsedModelId: (id: string | null) => Promise<void>;
  /** The model the app would load right now. */
  readActive: () => Promise<AutoReleaseActive>;
  /** Load a specific model by id. Rejects on failure. */
  loadModel: (modelId: string) => Promise<void>;
}

/** Decision for the last-used warm-up. */
export type LastUsedDecision = "none" | "clear" | "warm";

/** Decide whether to warm up the last-used model.
 *
 * "none"   — no last-used id, or an active model already exists; leave it.
 * "clear"  — the last-used model is gone, not downloaded, or remote; drop it.
 * "warm"   — warm this model up. */
export function decideLastUsedWarmUp(input: {
  lastUsedModelId: string | null;
  active: AutoReleaseActive;
}): LastUsedDecision {
  if (!input.lastUsedModelId) return "none";
  // An active model already exists — never override it.
  if (input.active.modelId) return "none";
  // The model is gone or not downloaded — drop the record without loading.
  if (!input.active.downloaded) return "clear";
  // Remote provider has no local engine.
  if (input.active.providerType !== "local") return "clear";
  return "warm";
}

/** Warm up the last-used model on cold launch.
 *
 * Runs when no model is active. Bounded by the same splash timeout as the
 * auto-release restore. The record is cleared ONLY on successful load — a
 * failed load retries next launch. A deliberately offloaded model leaves no
 * record behind (offload clears it), so it never resurrects. */
export async function warmUpLastUsedModel(
  deps: LastUsedDeps,
  timeoutMs: number = AUTO_RELEASE_RELOAD_TIMEOUT_MS,
): Promise<void> {
  let lastUsedModelId: string | null = null;
  try {
    lastUsedModelId = await deps.readLastUsedModelId();
  } catch (e) {
    console.warn("[last-used] could not read the last-used model id:", e);
    return;
  }
  if (!lastUsedModelId) return;

  let decision: LastUsedDecision;
  try {
    decision = decideLastUsedWarmUp({
      lastUsedModelId,
      active: await deps.readActive(),
    });
  } catch (e) {
    console.warn("[last-used] could not read the active model:", e);
    return;
  }

  // No warm-up needed (active model exists, or no last-used id).
  if (decision === "none") return;

  // Last-used model cannot be loaded (deleted, not downloaded, remote).
  if (decision === "clear") {
    await deps.writeLastUsedModelId(null);
    return;
  }

  // Warm up the model.
  let settled: boolean;
  try {
    settled = await settleWithin(deps.loadModel(lastUsedModelId), timeoutMs);
  } catch (e) {
    // The load failed. The record stays: the next launch gets another try.
    console.warn("[last-used] warm-up load failed:", e);
    return;
  }
  if (!settled) {
    console.warn(
      "[last-used] the warm-up load did not finish in time; the app opens anyway",
    );
  }
  // The model is back, so the record has done its job.
  await deps.writeLastUsedModelId(null);
}

/** The production wiring: the real stores and the real engine.
 *
 * Every store is reached through a dynamic import, the way `mmproj.ts`
 * reaches the model store: these modules pull in native pieces that a
 * plain-Node test cannot resolve, and a lazy import keeps them out of the
 * graph until the app actually runs. */
export function createAutoRelease(): AutoReleaseDeps {
  return {
    readReleasedModelId: async () => {
      const { useInference } = await import("../../store/inference.ts");
      await useInference.getState().load();
      return useInference.getState().autoReleasedModelId;
    },
    writeReleasedModelId: async (id) => {
      const { useInference } = await import("../../store/inference.ts");
      // The setter returns the write: the record has to be on disk before
      // the engine is freed, or the process can be killed without it.
      await useInference.getState().setAutoReleasedModelId(id);
    },
    readActive: async () => {
      const { useModelStore } = await import("../../store/model-store.ts");
      const m = useModelStore.getState();
      const spec = m.activeModelId
        ? m.models.find((model) => model.id === m.activeModelId)
        : undefined;
      return {
        modelId: m.activeModelId,
        providerType: m.activeProviderType,
        downloaded: spec?.downloadStatus === "completed",
      };
    },
    reloadEngine: async (modelId?: string) => {
      const { reloadLocalEngine } = await import("../../store/chat/index.ts");
      await reloadLocalEngine(modelId);
    },
  };
}

/** Production wiring for the last-used warm-up. */
export function createLastUsedWarmUp(): LastUsedDeps {
  return {
    readLastUsedModelId: async () => {
      const { useModelStore } = await import("../../store/model-store.ts");
      return useModelStore.getState().lastUsedModelId;
    },
    writeLastUsedModelId: async (id) => {
      const { useModelStore } = await import("../../store/model-store.ts");
      await useModelStore.getState().setLastUsedModel(id);
    },
    readActive: async () => {
      const { useModelStore } = await import("../../store/model-store.ts");
      const m = useModelStore.getState();
      const spec = m.activeModelId
        ? m.models.find((model) => model.id === m.activeModelId)
        : undefined;
      return {
        modelId: m.activeModelId,
        providerType: m.activeProviderType,
        downloaded: spec?.downloadStatus === "completed",
      };
    },
    loadModel: async (modelId: string) => {
      const { reloadLocalEngine } = await import("../../store/chat/index.ts");
      // Use reloadSpecific to load a specific model (like auto-release does)
      await reloadLocalEngine(modelId);
    },
  };
}
