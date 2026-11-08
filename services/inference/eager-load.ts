/** Eager Load coordinator: ONE owner for "make this model the running one".
 *
 *  PocketPal funnels every eager load through a two-phase, serialized
 *  lifecycle (ModelStore.ts `initContext`): a pre-flight outside the mutex
 *  (resolve config, decide memory, let the user confirm) and the actual
 *  switch inside it, with a "last-one-wins" pending id set at request time
 *  and checked again both before and inside the mutex (:2222, :2251, :2273).
 *  This module is that lifecycle, shaped like `auto-release.ts`: pure rules
 *  plus collaborators injected by the caller, so the rules run without
 *  stores, native modules or a device (spec "One eager-load coordinator").
 *
 *  Two things sit ON TOP of the reference's shape here:
 *  - the already-loaded short-circuit is part of the pre-flight (the Models
 *    screen's card cannot re-read a multi-gigabyte file on a re-tap);
 *  - bookkeeping for the card spinner is ownership-gated: the request that
 *    claimed the slot LAST owns the spinner and the pointer, an older
 *    section never clears what a newer claim put up (a superseded load
 *    resolves clean and does no native work at all).
 *
 *  Serialization: a promise-chain FIFO (the manager's and TTS runtime's
 *  shape). It is a SECOND lock below the engine manager's own — this one
 *  exists to close the gap between pre-flight and switch that the manager
 *  cannot see: a superseded request never reaches `switchEngine` at all.
 *
 *  Failure: a failed switch resolves through the outcome, leaves the pointer
 *  cleared and the spinner down — nothing pretends a model is active, the
 *  slot above stays empty (the manager drops it before/at the load), and the
 *  health readout stays honest. `reload` keeps its own callers' contract
 *  (the context ladder's recovery) and still REJECTS on failure.
 *
 *  Calibration: a successful load calls `onLoadSuccess` with the memory
 *  requirement that was actually loaded. The caller (model store) uses this
 *  to raise the learned ceiling (`largestSuccessfulBytes`) — never lowered
 *  by failed loads, releases, or declined dialogs (spec "Calibration bytes,
 *  not available-memory sampling").
 */

import type { LlamaInitParams } from "./local-engine.ts";

/** The model the app would load right now (store pointer, verbatim). */
export interface EagerLoadActive {
  modelId: string | null;
  providerType: "local" | "remote" | null;
}

/** Everything one eager load runs with: the local source plus the projector
 *  and draft/init paths the pre-flight resolved for it. Local only — a
 *  remote provider is not this coordinator's switch (resolveTarget answers
 *  null instead), the manager keys those by provider. */
export interface LocalEngineTarget {
  source: { kind: "local"; fileName: string };
  mmprojPath?: string;
  init?: LlamaInitParams;
  /** The memory requirement in bytes for this load (main + draft + projector + KV cache).
   *  Computed by the caller during pre-flight using the same estimator the
   *  memory gate uses — chip honesty. */
  requirementBytes: number;
}

/** Should this eager load run, or is the model already the running one? */
export type LoadPlan = "short-circuit" | "switch";

/** The pre-flight's first question: is that model ALREADY the active one,
 *  supported by a warm slot? The re-tap that must never re-read a
 *  multi-gigabyte file. Only a LOCAL pointer counts — a remote provider
 *  activation has no local context, and a cold slot (a background
 *  auto-release) means there is nothing warm to reuse. */
export function planLoad(input: {
  requestedId: string;
  active: EagerLoadActive;
  slotWarm: boolean;
}): LoadPlan {
  if (
    input.slotWarm &&
    input.active.providerType === "local" &&
    input.active.modelId === input.requestedId
  ) {
    return "short-circuit";
  }
  return "switch";
}

/** What a completed `load` leaves behind. */
export type EagerLoadOutcome =
  | "loaded" // the model is up (fresh switch, or it already was)
  | "superseded" // a newer request overtook it; no native work happened
  | "failed"; // the switch failed; nothing is active

/** The collaborators the lifecycle runs with. Injected so the rules can be
 *  exercised without the stores or the device. */
export interface EagerLoadDeps {
  /** The active pointer right now (store state). */
  readActive(): Promise<EagerLoadActive>;
  /** Does the engine slot hold a live context right now? */
  isSlotWarm(): Promise<boolean>;
  /** Pre-flight target resolution: for a model id when non-null, else the
   *  ACTIVE pointer's (the `reload` shape). Null = cannot be loaded. */
  resolveTarget(modelId: string | null): Promise<LocalEngineTarget | null>;
  /** The switch: make the slot hold this target. Rejects on failure. */
  switchEngine(target: LocalEngineTarget): Promise<void>;
  /** Stop and free the slot (Offload). */
  releaseSlot(): Promise<void>;
  /** Move the active pointer to a local model (or null). Fire-and-forget. */
  setActiveModel(modelId: string | null): void;
  /** Move the card spinner (model store). Fire-and-forget. */
  setLoadingModel(modelId: string | null): void;
  /** Called when a load SUCCEEDS with the memory requirement that was loaded.
   *  The caller uses this to raise the learned ceiling (largestSuccessfulBytes).
   *  Never called for failed loads, releases, or declined dialogs. */
  onLoadSuccess?(requirementBytes: number): void;
  /** Clear the last-used model record (persisted). Called on explicit offload
   *  so a deliberate unload is never resurrected at launch. */
  clearLastUsedModel?(): void;
}

export interface EagerLoad {
  /** Eager Load of `modelId`: the two-phase lifecycle. Never rejects —
   *  the outcome carries what a caller needs. */
  load(modelId: string): Promise<EagerLoadOutcome>;
  /** Offload: release the slot and clear the pointer, inside the lock. */
  offload(): Promise<void>;
  /** Reload the ACTIVE model at today's settings. Rejects on failure —
   *  the context ladder's recovery owns its own rollback. */
  reload(): Promise<void>;
  /** Reload a SPECIFIC model (used by auto-release restore).
   *  Verifies the model is still the active one inside the mutex before switching.
   *  Rejects on failure; the auto-release restore keeps its flag on failure. */
  reloadSpecific(modelId: string): Promise<void>;
}

export function createEagerLoad(deps: EagerLoadDeps): EagerLoad {
  /** FIFO chain the switch runs on (the manager/TTS serialize shape). */
  let mutex: Promise<unknown> = Promise.resolve();

  /** The newest request, set at claim time. A queued section whose sequence
   *  is behind this skips — last-one-wins (PocketParity: `pendingModelId`
   *  checked inside the mutex, ModelStore.ts:2273). For reloadSpecific,
   *  also carries the expected model ID for the identity check inside
   *  the mutex (PocketParity: pendingModelId !== model.id check). */
  let pending: { seq: number; kind: "load" | "reload" | "offload"; expectedModelId?: string } | null =
    null;

  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = mutex.then(fn, fn);
    // Swallow only onto the chain: a rejecting section must not poison the
    // queued one. The returned promise still propagates to the caller.
    mutex = next.catch(() => undefined);
    return next;
  }

  /** Eager Load, lifecycle phases in order. */
  async function load(modelId: string): Promise<EagerLoadOutcome> {
    // === Phase 1, still outside the lock: the already-loaded question. ===
    // Best-effort reads: an unreadable store is not a failure worth
    // reporting — the switch below is what proves and repairs intent.
    let alreadyLoaded = false;
    try {
      const active = await deps.readActive();
      const warm = await deps.isSlotWarm();
      alreadyLoaded =
        planLoad({ requestedId: modelId, active, slotWarm: warm }) ===
        "short-circuit";
    } catch {
      // Fall through to the switch.
    }
    if (alreadyLoaded) return "loaded";

    // Claim: mark intent and give the UI its feedback NOW — pointer and
    // spinner move here, the way the screen used to before the load call
    // (PocketParity: isContextLoading + loadingModel at the START,
    // ModelStore.ts:2222:2226).
    const seq = (pending = { seq: (pending?.seq ?? 0) + 1, kind: "load" });
    deps.setActiveModel(modelId);
    deps.setLoadingModel(modelId);
    // === Phase 1, continued: resolve the projector and draft/init paths ===
    // outside the lock, where a visible decision (the 03 confirm) is fine.
    const target = await deps.resolveTarget(modelId);
    // === Phase 2: the switch, inside the lock. ===
    return serialize(() => settleLoad(seq, target));
  }

  /** The locked half of a load: supersession check, switch, bookkeeping. */
  async function settleLoad(
    claim: { seq: number; kind: "load" | "reload" | "offload" },
    target: LocalEngineTarget | null,
  ): Promise<EagerLoadOutcome> {
    const isCurrentSeq = () => pending === claim;

    if (!isCurrentSeq()) return "superseded"; // no native work at all
    if (!target) {
      console.warn(`[eager-load] "${claim.kind}" target could not be resolved`);
      deps.setActiveModel(null);
      deps.setLoadingModel(null);
      return "failed";
    }
    let settled: "loaded" | "failed";
    try {
      await deps.switchEngine(target);
      settled = "loaded";
    } catch (e) {
      console.warn("[eager-load] load failed:", e);
      settled = "failed";
    }
    // The switch can hold the lock a long time; a newer claim may have
    // arrived behind it. Its bookkeeping owns the pointer/spinner now —
    // this section must touch neither.
    if (!isCurrentSeq()) return "superseded";
    deps.setLoadingModel(null);
    if (settled === "failed") {
      // Nothing pretends the model is active: revert the pointer so the
      // readout and the card's state stay honest, slot above stays empty.
      deps.setActiveModel(null);
      return "failed";
    }
    // Calibration: successful load raises the learned ceiling.
    // Only called on SUCCESS — failed loads, releases, and declined dialogs
    // never lower it (spec "Calibration bytes, not available-memory sampling").
    if (deps.onLoadSuccess) {
      deps.onLoadSuccess(target.requirementBytes);
    }
    return "loaded";
  }

  async function offload(): Promise<void> {
    const claim: { seq: number; kind: "load" | "reload" | "offload" } = (
      pending = { seq: (pending?.seq ?? 0) + 1, kind: "offload" }
    );
    deps.setLoadingModel(null);
    return serialize(async () => {
      // A newer claim owns the slot state; the offload stands down.
      if (pending !== claim) return;
      await deps.releaseSlot();
      deps.setActiveModel(null);
      // Clear the last-used record so a deliberate offload is never
      // resurrected at cold launch.
      if (deps.clearLastUsedModel) {
        deps.clearLastUsedModel();
      }
    });
  }

  async function reload(): Promise<void> {
    const claim: { seq: number; kind: "load" | "reload" | "offload" } = (
      pending = { seq: (pending?.seq ?? 0) + 1, kind: "reload" }
    );
    deps.setLoadingModel(null);
    // Preflight outside the lock: the active pointer's target, at the
    // settings resolved NOW (the ladder's nCtx write has already happened
    // when its caller reaches this).
    const target = await deps.resolveTarget(null);
    return serialize(async () => {
      if (pending !== claim) return; // superseded: resolve clean, no native work
      if (!target) return; // nothing active to reload — silent, as before
      await deps.switchEngine(target); // rejections propagate: the ladder rolls back
    });
  }

  /** Reload a specific model (auto-release restore).
   *  Like reload(), but resolves the target for the given modelId and
   *  verifies it's still the active model inside the mutex before switching.
   *  PocketParity: pendingModelId check inside mutex (ModelStore.ts:2273). */
  async function reloadSpecific(modelId: string): Promise<void> {
    const claim: {
      seq: number;
      kind: "load" | "reload" | "offload";
      expectedModelId: string;
    } = (pending = {
      seq: (pending?.seq ?? 0) + 1,
      kind: "reload",
      expectedModelId: modelId,
    });
    deps.setLoadingModel(null);
    // Preflight outside the lock: resolve the target for the SPECIFIC model,
    // not the active pointer. The auto-release restore already decided this
    // is the model to warm; we must not load whatever the pointer names now.
    const target = await deps.resolveTarget(modelId);
    return serialize(async () => {
      // Supersession check: a newer claim (load/offload/reloadSpecific) wins.
      if (pending !== claim) return;
      // Model identity check: the active model must still be the one we
      // intended to reload. If the user switched models while we waited for
      // the mutex, we stand down — the flag will be cleared by the caller
      // if appropriate, or the next launch will retry.
      // PocketParity: pendingModelId !== model.id || wasAutoReleased check
      // (ModelStore.ts:1170).
      const active = await deps.readActive();
      if (active.modelId !== claim.expectedModelId) return;
      if (!target) return; // model not loadable (remote, not downloaded, etc.)
      await deps.switchEngine(target); // rejections propagate
    });
  }

  return { load, offload, reload, reloadSpecific };
}
