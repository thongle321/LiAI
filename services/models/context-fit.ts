/** Context-fit classification: can this model load at a candidate n_ctx?
 *
 * Pure and store-free. The caller injects the byte estimator and the two
 * memory bounds, so this runs under `jest` with no device and no
 * loaded model — and, just as importantly, so the number the classifier
 * judges is the number the load path would act on.
 *
 * Boundaries are inclusive on both sides: a requirement exactly equal to
 * the ceiling fits, one exactly equal to total RAM is merely tight.
 */

import {
  estimateModelMemory,
  type MemoryContext,
  type MemoryModel,
} from "./memoryEstimator.ts";

export type FitStatus = "fits" | "tight" | "wont_fit";

/** Headroom held back for the OS and everything else sharing the RAM.
 *  Mirrors upstream's conservative fallback heuristic. */
const RESERVE_BYTES = 1.2 * 1024 * 1024 * 1024;
/** …and the share of RAM a model load may claim when that binds instead. */
const RAM_SHARE = 0.6;

/** The safe ceiling for a device.
 *
 *  Fallback: min(60% of RAM, RAM - 1.2GB). The 60% share binds on
 *  memory-rich phones; the reserve binds on small ones, where leaving
 *  1.2GB is proportionally more of the machine.
 *
 *  Raised (never lowered) by `largestSuccessfulBytes` — the memory a
 *  model actually loaded at, which beats any heuristic. Unreadable RAM
 *  yields 0: there is nothing to derive from, and a guessed ceiling
 *  would be a confident-looking lie. Calibration still lifts it.
 */
export function safeCeiling(
  totalMemory: number | null,
  largestSuccessfulBytes = 0,
): number {
  const fallback =
    totalMemory && totalMemory > 0
      ? Math.max(0, Math.min(totalMemory * RAM_SHARE, totalMemory - RESERVE_BYTES))
      : 0;
  return Math.max(fallback, largestSuccessfulBytes);
}

export interface FitStatusDeps {
  /** Memory required to load the model at a candidate n_ctx, via the same
   *  estimator the load path uses. */
  memBytesFor: (nCtx: number) => number;
  /** Calibrated ceiling at or below which a load is considered safe. */
  ceiling: number;
  /** Total device RAM in bytes; 0/unreadable collapses the tight zone. */
  totalMemory: number;
}

/** Three-zone classifier for one model on one device. */
export function makeFitStatusFor(
  { memBytesFor, ceiling, totalMemory }: FitStatusDeps,
): (nCtx: number) => FitStatus {
  return (nCtx) => {
    const required = memBytesFor(nCtx);
    if (required <= ceiling) return "fits";
    // No readable RAM: no middle state. Better a binary the caller can
    // trust than "tight" against a bound we never measured.
    if (totalMemory > 0 && required <= totalMemory) return "tight";
    return "wont_fit";
  };
}

/** Gate for a "more room" affordance: true iff at least one size above the
 *  current one actually fits. The caller passes a ladder it has already
 *  bounded by the model's own maximum — this helper deliberately knows
 *  nothing about that value. */
export function hasFittingUpgrade(
  ladder: readonly number[],
  currentNCtx: number,
  fitStatusFor: (nCtx: number) => FitStatus,
): boolean {
  return ladder.some(
    (tier) =>
      tier > currentNCtx && fitStatusFor(tier) === "fits",
  );
}

/** Byte estimator for one model, wired exactly the way the model card's
 *  estimate is wired: weights plus GGUF metadata, the inference store's
 *  cache/ubatch settings, and no projector or draft. Using it here is
 *  what keeps the chip honest — same inputs, same number.
 *
 *  `ctx` is everything except nCtx, which is what varies per candidate. */
export function makeMemoryBytesFor(
  model: MemoryModel,
  ctx: Omit<MemoryContext, "nCtx">,
): (nCtx: number) => number {
  return (nCtx) =>
    estimateModelMemory(model, undefined, undefined, { ...ctx, nCtx });
}
