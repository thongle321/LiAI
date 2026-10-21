/** The context ladder for the ACTIVE local model, on THIS device.
 *
 * The stops, their memory cost and their fit are pure
 * (services/chat//context-ladder.ts); what needs the device is the three inputs:
 * the active model's GGUF metadata for its trained maximum, the inference
 * settings the estimator is wired to, and the device's RAM.
 *
 * One hook so the banner and the sheet cannot disagree: the banner hides
 * "More room" when `anyFits` is false, and the sheet offers a new chat
 * instead. Both read this.
 */

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useInference } from "@/store/inference.ts";
import { useModelStore } from "@/store/model-store.ts";
import {
  buildContextLadder,
  CONTEXT_LADDER,
  type ContextLadder,
} from "@/services/chat/context-ladder.ts";
import { maxContextLength, type GgufHeader } from "@/services/models/gguf-metadata.ts";
import { toMemoryMetadata } from "@/services/models/memoryEstimator.ts";
import {
  makeFitStatusFor,
  makeMemoryBytesFor,
  safeCeiling,
  type FitStatus,
} from "@/services/models/context-fit.ts";
import { readTotalMemory } from "@/services/models/device-tiers.ts";

const EMPTY: ContextLadder = { stops: [], anyFits: false, defaultIndex: 0 };

export interface ContextLadderView extends ContextLadder {
  /** The model's trained maximum, or the ladder top when it declares none. */
  modelMaxNCtx: number;
  fitStatusFor: (nCtx: number) => FitStatus;
}

export function useContextLadder(currentNCtx: number): ContextLadderView {
  const params = useInference(
    useShallow((s) => ({
      cacheK: s.cacheK,
      cacheV: s.cacheV,
      nUbatch: s.nUbatch,
      specDraftCacheK: s.specDraftCacheK,
      specDraftCacheV: s.specDraftCacheV,
    })),
  );
  const model = useModelStore((s) =>
    s.models.find((m) => m.id === s.activeModelId),
  );
  const learnedCeilingBytes = useModelStore((s) => s.largestSuccessfulBytes);
  const [totalMemory, setTotalMemory] = useState(0);

  useEffect(() => {
    let live = true;
    void readTotalMemory().then((bytes) => {
      // Unreadable RAM stays 0, which collapses the classifier's tight zone
      // rather than inventing a middle state.
      if (live) setTotalMemory(bytes ?? 0);
    });
    return () => {
      live = false;
    };
  }, []);

  return useMemo(() => {
    if (!model) {
      return {
        ...EMPTY,
        modelMaxNCtx: CONTEXT_LADDER[CONTEXT_LADDER.length - 1],
        fitStatusFor: () => "wont_fit" as const,
      };
    }
    const memBytesFor = makeMemoryBytesFor(
      {
        size: model.files.reduce((sum, f) => sum + f.size, 0),
        gguf: toMemoryMetadata(model.ggufMetadata),
      },
      params,
    );
    const fitStatusFor = makeFitStatusFor({
      memBytesFor,
      ceiling: safeCeiling(totalMemory, learnedCeilingBytes),
      totalMemory,
    });
    // The trained maximum comes from the GGUF header. A remote endpoint's
    // configured context length is NOT it: that is a server setting and says
    // nothing about how far the weights were trained.
    const modelMaxNCtx =
      maxContextLength((model.ggufMetadata ?? {}) as GgufHeader) ??
      CONTEXT_LADDER[CONTEXT_LADDER.length - 1];
    return {
      ...buildContextLadder({
        currentNCtx,
        modelMaxNCtx,
        fitStatusFor,
        memBytesFor,
      }),
      modelMaxNCtx,
      fitStatusFor,
    };
  }, [model, params, totalMemory, learnedCeilingBytes, currentNCtx]);
}