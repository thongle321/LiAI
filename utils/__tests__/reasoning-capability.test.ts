import {
  EFFORT_LEVELS,
  resolveEffort,
  type EffortLevel,
} from "../reasoning-capability";

/** The levels an effort-grading model supports. */
const supported = (levels: EffortLevel[]): readonly EffortLevel[] => levels;

describe("resolveEffort", () => {
  it("returns undefined when there is no override — nothing is sent", () => {
    expect(resolveEffort(undefined)).toBeUndefined();
    expect(resolveEffort(null)).toBeUndefined();
  });

  it("keeps the override when the model supports it", () => {
    expect(resolveEffort("high", supported(["low", "medium", "high"]))).toBe(
      "high",
    );
  });

  it("keeps an override on a model whose declared support is unknown", () => {
    // Absent support = unknown (the spec never declared capacity); the
    // armed intent is preserved rather than guessed away.
    expect(resolveEffort("high")).toBe("high");
  });

  it("clamps an override the model does not support down to the nearest lower supported level", () => {
    // PocketPal #1002: a stored effort can outlive the model it was saved
    // against; the resolved effort clamps to the active model's levels.
    expect(resolveEffort("xhigh", supported(["low", "medium", "high"]))).toBe(
      "high",
    );
    expect(resolveEffort("high", supported(["low", "xhigh"]))).toBe("low");
  });

  it("falls back to the lowest supported level when none is lower", () => {
    expect(resolveEffort("minimal", supported(["low", "medium", "high"]))).toBe(
      "low",
    );
  });

  it("resolves to nothing when the model declares it grades no effort", () => {
    expect(resolveEffort("high", supported([]))).toBeUndefined();
  });

  it("exposes the canonical effort levels in intensity order", () => {
    expect(EFFORT_LEVELS).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});
