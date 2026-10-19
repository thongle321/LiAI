/** The tool-compat warning's verdict: one notice per model, only when a
 *  companion's talents and the model's capabilities disagree. */

import { TOOL_COMPAT_WARNING, shouldWarnToolCompat } from "../tool-compat";
import type { ToolCompatInput } from "../tool-compat";

function input(overrides: Partial<ToolCompatInput> = {}): ToolCompatInput {
  return {
    providerType: "local",
    talentNames: ["web_search"],
    supportsTools: false,
    alreadyWarned: false,
    ...overrides,
  };
}

describe("shouldWarnToolCompat", () => {
  it("warns when a local model with no tool support serves a companion with talents", () => {
    expect(shouldWarnToolCompat(input())).toBe(true);
  });

  it("stays quiet for a model that supports tools", () => {
    expect(shouldWarnToolCompat(input({ supportsTools: true }))).toBe(false);
  });

  it("stays quiet when the model was never probed", () => {
    expect(shouldWarnToolCompat(input({ supportsTools: undefined }))).toBe(false);
  });

  it("stays quiet for a companion that declares no talents", () => {
    expect(shouldWarnToolCompat(input({ talentNames: [] }))).toBe(false);
  });

  it("stays quiet for a remote provider", () => {
    expect(shouldWarnToolCompat(input({ providerType: "remote" }))).toBe(false);
  });

  it("stays quiet when no provider is active", () => {
    expect(shouldWarnToolCompat(input({ providerType: null }))).toBe(false);
  });

  it("stays quiet once the model has been warned about", () => {
    expect(shouldWarnToolCompat(input({ alreadyWarned: true }))).toBe(false);
  });
});

describe("TOOL_COMPAT_WARNING", () => {
  it("uses PocketPal's exact wording", () => {
    expect(TOOL_COMPAT_WARNING).toBe(
      "This model may not support tool calling. Results may be unreliable.",
    );
  });
});
