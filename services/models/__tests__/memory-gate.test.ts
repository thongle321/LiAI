/** Memory gate contract: pure predicate for model-load memory fit. */

import {
  memoryGate,
  computeLoadRequirement,
  getMemoryGateCeiling,
  getMemoryGateRequirement,
  type MemoryGateInput,
} from "../memory-gate.ts";
import type { MemoryModel, MemoryContext } from "../memoryEstimator.ts";

function model(size: number): MemoryModel {
  return { size, gguf: undefined };
}

function modelWithMetadata(size: number): MemoryModel {
  return {
    size,
    gguf: {
      n_layers: 32,
      n_embd: 4096,
      n_head: 32,
      n_head_kv: 32,
      n_vocab: 32000,
      n_embd_head_k: 128,
      n_embd_head_v: 128,
    },
  };
}

function ctx(nCtx: number): MemoryContext {
  return {
    nCtx,
    cacheK: "q8_0",
    cacheV: "q8_0",
    nUbatch: 512,
  };
}

describe("memoryGate", () => {
  // 8GB device: fallback ceiling = min(60% * 8GB = 4.8GB, 8GB - 1.2GB = 6.8GB) = 4.8GB
  const baseInput: MemoryGateInput = {
    mainModel: modelWithMetadata(2_000_000_000), // ~2GB model -> ~4.6GB requirement
    context: ctx(4096),
    totalMemory: 8_000_000_000, // 8GB device
    largestSuccessfulBytes: 0,
  };

  it("fits when requirement is at or below the calibrated ceiling", () => {
    // 2GB model with 4K ctx -> ~4.6GB, ceiling = 4.8GB -> fits
    expect(memoryGate(baseInput)).toBe("fits");
  });

  it("is tight when requirement exceeds ceiling but is within total RAM", () => {
    // 4GB model with 4K ctx -> ~5.7GB, ceiling = 4.8GB, total = 8GB -> tight
    const input: MemoryGateInput = {
      ...baseInput,
      mainModel: modelWithMetadata(4_000_000_000),
      context: ctx(4096),
    };
    expect(memoryGate(input)).toBe("tight");
  });

  it("is tight when requirement exceeds ceiling but is within total RAM (larger context)", () => {
    // 4GB model with 8K ctx -> ~7.0GB, ceiling = 4.8GB, total = 8GB -> tight
    const input: MemoryGateInput = {
      ...baseInput,
      mainModel: modelWithMetadata(4_000_000_000),
      context: ctx(8192),
    };
    expect(memoryGate(input)).toBe("tight");
  });

  it("wont_fit when requirement exceeds total RAM", () => {
    // 5GB model with 8K ctx -> ~8.4GB, total = 8GB -> wont_fit
    const input: MemoryGateInput = {
      ...baseInput,
      mainModel: modelWithMetadata(5_000_000_000),
      context: ctx(8192),
    };
    expect(memoryGate(input)).toBe("wont_fit");
  });

  it("collapses tight zone when totalMemory is unreadable (null)", () => {
    // 4GB model with 8K ctx -> ~7.0GB, no total RAM -> ceiling = 0 -> wont_fit
    const input: MemoryGateInput = {
      ...baseInput,
      totalMemory: null,
      mainModel: modelWithMetadata(4_000_000_000),
      context: ctx(8192),
    };
    expect(memoryGate(input)).toBe("wont_fit");
  });

  it("collapses tight zone when totalMemory is 0", () => {
    const input: MemoryGateInput = {
      ...baseInput,
      totalMemory: 0,
      mainModel: modelWithMetadata(4_000_000_000),
      context: ctx(8192),
    };
    expect(memoryGate(input)).toBe("wont_fit");
  });

  it("calibration raises the ceiling: a successful load lifts future verdicts", () => {
    // 4GB model with 4K ctx -> ~5.7GB
    // Without calibration: ceiling = 4.8GB -> tight
    // With calibration (6GB): ceiling = max(4.8GB, 6GB) = 6GB -> fits
    const input: MemoryGateInput = {
      ...baseInput,
      mainModel: modelWithMetadata(4_000_000_000),
      context: ctx(4096),
      largestSuccessfulBytes: 6_000_000_000, // previous successful load was 6GB
    };
    expect(memoryGate(input)).toBe("fits");
  });

  it("never lowers the ceiling: calibration only raises", () => {
    // Even if a new model is smaller, ceiling stays at the max
    const input: MemoryGateInput = {
      ...baseInput,
      mainModel: modelWithMetadata(1_000_000_000),
      context: ctx(4096),
      largestSuccessfulBytes: 6_000_000_000, // previous successful load was 6GB
    };
    // ceiling = max(4.8GB, 6GB) = 6GB
    expect(memoryGate(input)).toBe("fits");
  });
});

describe("computeLoadRequirement", () => {
  it("includes draft model bytes when draft is provided", () => {
    const input: MemoryGateInput = {
      mainModel: modelWithMetadata(2_000_000_000),
      draftModel: modelWithMetadata(500_000_000), // 500MB draft
      context: ctx(4096),
      totalMemory: 8_000_000_000,
      largestSuccessfulBytes: 0,
    };

    const withDraft = computeLoadRequirement(input);
    const withoutDraft = computeLoadRequirement({
      ...input,
      draftModel: undefined,
    });

    expect(withDraft).toBeGreaterThan(withoutDraft);
  });

  it("degrades silently when draft is null (missing on disk)", () => {
    const input: MemoryGateInput = {
      mainModel: modelWithMetadata(2_000_000_000),
      draftModel: null,
      context: ctx(4096),
      totalMemory: 8_000_000_000,
      largestSuccessfulBytes: 0,
    };

    const withNullDraft = computeLoadRequirement(input);
    const withoutDraft = computeLoadRequirement({
      ...input,
      draftModel: undefined,
    });

    expect(withNullDraft).toBe(withoutDraft);
  });

  it("includes projector bytes when provided", () => {
    const input: MemoryGateInput = {
      mainModel: modelWithMetadata(2_000_000_000),
      context: ctx(4096),
      projectionBytes: 100_000_000, // 100MB projector
      totalMemory: 8_000_000_000,
      largestSuccessfulBytes: 0,
    };

    const withProjector = computeLoadRequirement(input);
    const withoutProjector = computeLoadRequirement({
      ...input,
      projectionBytes: undefined,
    });

    expect(withProjector).toBeGreaterThan(withoutProjector);
  });
});

describe("getMemoryGateCeiling", () => {
  it("returns the same ceiling as safeCeiling", () => {
    const totalMemory = 8_000_000_000;
    const largestSuccessfulBytes = 3_000_000_000;

    expect(getMemoryGateCeiling(totalMemory, largestSuccessfulBytes)).toBe(
      Math.max(
        Math.min(totalMemory * 0.6, totalMemory - 1.2 * 1024 * 1024 * 1024),
        largestSuccessfulBytes,
      ),
    );
  });

  it("returns calibrated ceiling when it exceeds fallback", () => {
    expect(getMemoryGateCeiling(8_000_000_000, 10_000_000_000)).toBe(
      10_000_000_000,
    );
  });

  it("returns 0 when totalMemory is null and no calibration", () => {
    expect(getMemoryGateCeiling(null, 0)).toBe(0);
  });
});

describe("getMemoryGateRequirement", () => {
  it("returns the same value as computeLoadRequirement", () => {
    const input: MemoryGateInput = {
      mainModel: modelWithMetadata(2_000_000_000),
      draftModel: modelWithMetadata(500_000_000),
      context: ctx(4096),
      projectionBytes: 100_000_000,
      totalMemory: 8_000_000_000,
      largestSuccessfulBytes: 0,
    };

    expect(getMemoryGateRequirement(input)).toBe(computeLoadRequirement(input));
  });
});