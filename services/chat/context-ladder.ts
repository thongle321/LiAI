/** The context ladder: which larger sizes this model can be loaded at.
 *
 * Pure, so the stops, their labels, their memory cost and their fit for
 * THIS device are all node-testable without a device or a loaded model.
 * The sheet that draws them (components/chat/context-full-banner.tsx) only
 * renders what this returns.
 *
 * Ported from PocketPal: `utils/bannerVariantResolver.ts` (CONTEXT_LADDER)
 * and `components/IncreaseContextSheet/IncreaseContextSheet.tsx:38-73`.
 */

import type { FitStatus } from "../models/context-fit.ts";

/** Context-size stops, ascending. Clamped to the model's own trained
 *  maximum (ggufMetadata.context_length), which is appended as the
 *  rightmost stop when it is not already here. */
export const CONTEXT_LADDER = [
  2048, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304,
  131072,
] as const;

/** 6144 reads "6K", 12288 reads "12K". One decimal only when the thousands
 *  are not integral, which never happens for a ladder stop but can for a
 *  model's odd maximum. */
export function labelTokens(tokens: number): string {
  const k = tokens / 1024;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
}

/** Words a stop roughly holds. ≈0.75 words per token, rounded to the
 *  nearest hundred because the number is indicative, not measured. */
export function approxWords(tokens: number): number {
  return Math.round((tokens * 0.75) / 100) * 100;
}

export interface LadderStop {
  tokens: number;
  label: string;
  /** What the load path would need at this size, in bytes. */
  memBytes: number;
  words: number;
  fit: FitStatus;
}

export interface ContextLadder {
  stops: LadderStop[];
  /** False when no offered size fits — the sheet's no-fit branch. */
  anyFits: boolean;
  /** Index the sheet opens on: the first fitting stop, else the first. */
  defaultIndex: number;
}

export function buildContextLadder({
  currentNCtx,
  modelMaxNCtx,
  fitStatusFor,
  memBytesFor,
}: {
  currentNCtx: number;
  /** The model's trained maximum. A remote endpoint's configured context
   *  length is NOT this: it says nothing about how far the weights were
   *  trained. */
  modelMaxNCtx: number;
  fitStatusFor: (nCtx: number) => FitStatus;
  memBytesFor: (nCtx: number) => number;
}): ContextLadder {
  const sizes = CONTEXT_LADDER.filter(
    (n) => n > currentNCtx && n <= modelMaxNCtx,
  ) as number[];
  // Appended only when it is a genuine upgrade: at or below the current
  // setting it is not a stop on this ladder.
  if (modelMaxNCtx > currentNCtx && modelMaxNCtx > (sizes[sizes.length - 1] ?? 0)) {
    sizes.push(modelMaxNCtx);
  }
  const stops = sizes.map((tokens) => ({
    tokens,
    label: labelTokens(tokens),
    memBytes: memBytesFor(tokens),
    words: approxWords(tokens),
    fit: fitStatusFor(tokens),
  }));
  const fitting = stops.findIndex((s) => s.fit === "fits");
  return {
    stops,
    anyFits: fitting >= 0,
    defaultIndex: fitting >= 0 ? fitting : 0,
  };
}