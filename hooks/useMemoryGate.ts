/** Memory-gate hook: confirm before loading a model that exceeds the ceiling.
 *
 * Lives in a hook per ARCH (Alert is UI; the predicate is lib).
 * Mirrors the shape of `useLoadGuard` for downloads.
 */

import { Alert } from "react-native";

import {
  memoryGate,
  getMemoryGateCeiling,
  getMemoryGateRequirement,
  type MemoryGateInput,
  type MemoryGateVerdict,
} from "@/services/models/memory-gate.ts";
import { useModelStore } from "@/store/model-store";
import { useInference } from "@/store/inference.ts";
import { toMemoryMetadata } from "@/services/models/memoryEstimator.ts";
import type { ModelSpec } from "@/types/models";

export interface MemoryGateDeps {
  /** The model spec to load. */
  model: ModelSpec;
  /** Optional draft model spec (for speculative decoding). */
  draftModel?: ModelSpec | null;
  /** Projector bytes if vision is enabled. */
  projectionBytes?: number;
  /** Total device RAM in bytes, or null if unreadable. */
  totalMemory: number | null;
}

/** Hook that returns a guard function for the Load action.
 *
 * If the model's memory requirement exceeds the learned ceiling, shows a
 * confirm dialog with the real numbers. Accept proceeds; Decline does nothing.
 */
export function useMemoryGate(): (
  deps: MemoryGateDeps,
  proceed: () => void,
  cancel?: () => void,
) => void {
  const largestSuccessfulBytes = useModelStore((s) => s.largestSuccessfulBytes);
  const { nCtx, cacheK, cacheV, nUbatch, specDraftCacheK, specDraftCacheV, speculativeEnabled, draftModelId } =
    useInference(
      (s) => ({
        nCtx: s.nCtx,
        cacheK: s.cacheK,
        cacheV: s.cacheV,
        nUbatch: s.nUbatch,
        specDraftCacheK: s.specDraftCacheK,
        specDraftCacheV: s.specDraftCacheV,
        speculativeEnabled: s.speculativeEnabled,
        draftModelId: s.draftModelId,
      }),
    );

  return (deps, proceed, cancel?) => {
    const { model, draftModel: explicitDraftModel, projectionBytes, totalMemory } = deps;

    // Build the memory context from current inference settings
    const context = {
      nCtx,
      cacheK,
      cacheV,
      nUbatch,
      specDraftCacheK,
      specDraftCacheV,
    };

    // Resolve the draft model: prefer explicitDraftModel (passed from the caller),
    // fall back to the draftModelId from settings if speculative decoding is enabled
    let draftModel: ModelSpec | undefined;
    if (explicitDraftModel) {
      draftModel = explicitDraftModel;
    } else if (speculativeEnabled && draftModelId) {
      // The draft model ID from settings - we need to find it in the model store
      // This will be handled by the caller passing the right draft model
      // (the Models screen knows which draft is selected for this model)
    }

    // Build MemoryModel for main model
    const mainModel: MemoryGateDeps["model"] extends ModelSpec ? {
      size: number;
      gguf?: ReturnType<typeof toMemoryMetadata>;
    } : never = {
      size: model.files.reduce((sum, f) => sum + f.size, 0),
      gguf: toMemoryMetadata(model.ggufMetadata),
    };

    // Build MemoryModel for draft if present and downloaded
    let draft: { size: number; gguf?: ReturnType<typeof toMemoryMetadata> } | undefined;
    if (draftModel && draftModel.downloadStatus === "completed") {
      draft = {
        size: draftModel.files.reduce((sum, f) => sum + f.size, 0),
        gguf: toMemoryMetadata(draftModel.ggufMetadata),
      };
    }

    const input: MemoryGateInput = {
      mainModel,
      draftModel: draft,
      context,
      projectionBytes,
      totalMemory,
      largestSuccessfulBytes,
    };

    const verdict = memoryGate(input);

    // Only show dialog if the verdict is "tight" or "wont_fit" (i.e., exceeds ceiling)
    // "fits" means it's at or below the ceiling - no dialog needed
    if (verdict === "fits") {
      proceed();
      return;
    }

    const requirement = getMemoryGateRequirement(input);
    const ceiling = getMemoryGateCeiling(totalMemory, largestSuccessfulBytes);

    const formatBytes = (bytes: number): string => {
      const gb = bytes / (1024 * 1024 * 1024);
      return `${gb.toFixed(2)} GB`;
    };

    const requirementStr = formatBytes(requirement);
    const ceilingStr = formatBytes(ceiling);
    const totalStr = totalMemory !== null ? formatBytes(totalMemory) : "unknown";

    let message: string;
    if (verdict === "tight") {
      message = `This model needs ${requirementStr} but the learned safe ceiling for this device is ${ceilingStr} (total RAM: ${totalStr}). It may still work, but could run out of memory.`;
    } else {
      // "wont_fit"
      message = `This model needs ${requirementStr} which exceeds this device's total RAM (${totalStr}). It will almost certainly fail to load.`;
    }

    Alert.alert(
      "Memory check",
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => cancel?.() },
        { text: "Load anyway", onPress: proceed },
      ],
    );
  };
}