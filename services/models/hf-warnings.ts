/** Download-time warnings for a Hugging Face file card.
 *
 * PocketParity: PocketPal computes these per file and shows them as chips
 * on the card, then repeats the list in a snackbar when the download
 * starts. The rules live here, pure, because they are the part worth
 * testing; the card and the snackbar only render them.
 *
 * Kept separate from hf-format.ts on purpose: that file formats strings
 * off a response, this one decides whether a download is a bad idea.
 */

import { isLegacyQuantization } from "./hf-format.ts";
import { exceedsLearnedCeiling } from "@/utils/load-guard.ts";

export type HFWarningCode =
  | "not-enough-space"
  | "short-memory"
  | "multimodal-without-projector"
  | "legacy-quantization";

export interface HFFileWarning {
  code: HFWarningCode;
  label: string;
}

export interface HFFileWarningInput {
  fileName: string;
  /** What the card is about to fetch, or the pair total for a vision model. */
  requiredBytes: number;
  isVision: boolean;
  /** Always false until mmproj pairing lands (ADR-0011 defers it), but the
   *  rule stays honest so pairing does not have to rewrite this. */
  hasProjector: boolean;
  /** null when the free-space read failed: unknown is not a block. */
  freeBytes: number | null;
  /** Largest download that has ever succeeded here (0 = nothing yet). */
  learnedCeilingBytes: number;
}

export function hfFileWarnings({
  fileName,
  requiredBytes,
  isVision,
  hasProjector,
  freeBytes,
  learnedCeilingBytes,
}: HFFileWarningInput): HFFileWarning[] {
  const warnings: HFFileWarning[] = [];

  if (freeBytes !== null && requiredBytes > freeBytes) {
    warnings.push({ code: "not-enough-space", label: "Not enough space" });
  }
  // PocketParity: the chip is the memory-fit verdict for this device
  // (ModelFileCard.tsx:119-144 reads useMemoryCheck's fit, not a raw
  // size-vs-download comparison), so the load guard's learned rule
  // applies — EXCEEDS_LEARNED_CEILING with its 1.5x headroom, so the
  // chip and the "Large model" confirm can never disagree, and a small
  // model inside the headroom stays silent instead of warning wherever
  // a row is browsed.
  if (exceedsLearnedCeiling(requiredBytes, learnedCeilingBytes)) {
    warnings.push({ code: "short-memory", label: "Memory tight" });
  }
  if (isVision && !hasProjector) {
    warnings.push({
      code: "multimodal-without-projector",
      label: "No projector",
    });
  }
  if (isLegacyQuantization(fileName)) {
    warnings.push({
      code: "legacy-quantization",
      label: "Legacy quantization",
    });
  }

  return warnings;
}
