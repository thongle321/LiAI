/** Memory gate for model loading: can this model load on this device?
 *
 * Pure and store-free. The caller injects the byte estimator, the ceiling
 * arithmetic, and the total RAM — the same vocabulary the context ladder
 * uses — so the number the gate judges is the number the load path acts on.
 * This is the "chip honesty" rule: the dialog shows the same bytes the
 * estimator computes.
 *
 * A paired draft model's bytes ride along in the requirement when speculative
 * decoding is enabled AND the draft is downloaded. A chosen-but-missing draft
 * degrades to no draft silently (never blocks the load).
 *
 * The verdict uses the three-zone classifier from context-fit: "fits" (at or
 * below ceiling), "tight" (between ceiling and total RAM, only when RAM is
 * readable), "wont_fit" (above total RAM or unreadable RAM with no middle
 * state). Unreadable RAM collapses the middle state into a binary answer
 * (never a guessed number).
 */

import {
  estimateModelMemory,
  type MemoryModel,
  type MemoryContext,
} from "./memoryEstimator.ts";
import { safeCeiling } from "./context-fit.ts";

export type MemoryGateVerdict = "fits" | "tight" | "wont_fit";

export interface MemoryGateInput {
  /** The main model to load. */
  mainModel: MemoryModel;
  /** Optional paired draft model for speculative decoding. */
  draftModel?: MemoryModel | null;
  /** Inference settings that affect memory (nCtx, cache types, ubatch). */
  context: MemoryContext;
  /** Projector bytes (mmproj), if any. */
  projectionBytes?: number;
  /** Total device RAM in bytes, or null if unreadable. */
  totalMemory: number | null;
  /** Calibrated ceiling: the largest successful load observed on this device. */
  largestSuccessfulBytes: number;
}

/** Compute the memory requirement for a model load, including draft if present. */
export function computeLoadRequirement(input: MemoryGateInput): number {
  const { mainModel, draftModel, context, projectionBytes } = input;
  return estimateModelMemory(
    mainModel,
    projectionBytes,
    draftModel ?? undefined,
    context,
  );
}

/** Determine if a model load fits within the device's memory constraints. */
export function memoryGate(input: MemoryGateInput): MemoryGateVerdict {
  const requirement = computeLoadRequirement(input);
  const ceiling = safeCeiling(input.totalMemory, input.largestSuccessfulBytes);

  if (requirement <= ceiling) return "fits";

  // No readable RAM: no middle state. Better a binary the caller can
  // trust than "tight" against a bound we never measured.
  if (input.totalMemory !== null && input.totalMemory > 0) {
    if (requirement <= input.totalMemory) return "tight";
  }

  return "wont_fit";
}

/** Get the ceiling used by the memory gate (for display in the confirm dialog). */
export function getMemoryGateCeiling(
  totalMemory: number | null,
  largestSuccessfulBytes: number,
): number {
  return safeCeiling(totalMemory, largestSuccessfulBytes);
}

/** Get the requirement bytes for display in the confirm dialog. */
export function getMemoryGateRequirement(input: MemoryGateInput): number {
  return computeLoadRequirement(input);
}