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
 * "nothing was auto-released" — and clears it on the first launch that sees
 * it, exactly like PocketPal's unconditional `clearAutoReleaseFlags()`.
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
  /** Load the local engine now. Rejects when the load fails. */
  reloadEngine: () => Promise<void>;
}

/** Record the model we are about to free.
 *
 * A remote provider is skipped: there is no local engine to restore, so a
 * flag naming it would only produce a pointless load attempt later. */
export async function markAutoReleased(deps: AutoReleaseDeps): Promise<void> {
  const active = await deps.readActive();
  if (active.providerType !== "local") return;
  if (!active.modelId) return;
  await deps.writeReleasedModelId(active.modelId);
}

/** Forget the auto-release: the model is back, or it was never ours. */
export async function clearAutoReleased(deps: AutoReleaseDeps): Promise<void> {
  await deps.writeReleasedModelId(null);
}

/** Warm the model back up after a restart.
 *
 * Never rejects: a failed load is the next turn's problem, and the app must
 * open either way. The flag is cleared in every case, so a launch is the one
 * chance this model gets to be warmed. */
export async function restoreAutoReleasedModel(
  deps: AutoReleaseDeps,
  timeoutMs: number = AUTO_RELEASE_RELOAD_TIMEOUT_MS,
): Promise<void> {
  const releasedModelId = await deps.readReleasedModelId();
  if (!releasedModelId) return;
  try {
    const active = await deps.readActive();
    if (decideAutoRelease({ releasedModelId, active }) === "reload") {
      const settled = await settleWithin(deps.reloadEngine(), timeoutMs);
      if (!settled) {
        console.warn(
          "[auto-release] the warm-up load did not finish in time; the app opens anyway",
        );
      }
    }
  } catch (e) {
    console.warn("[auto-release] warm-up load failed:", e);
  } finally {
    await deps.writeReleasedModelId(null);
  }
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
      useInference.getState().setAutoReleasedModelId(id);
    },
    readActive: async () => {
      const { useModelStore } = await import("../../store/modelStore.ts");
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
    reloadEngine: async () => {
      const { reloadLocalEngine } = await import("../../store/chat/index.ts");
      await reloadLocalEngine();
    },
  };
}
