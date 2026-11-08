/** AI Prompt Generation service: builds the generation prompt and calls
 *  the engine with a JSON schema. Pure logic is node-testable; the engine
 *  call is a seam we stub.
 */

import { buildGenerationPrompt, GENERATION_SCHEMA } from "../ai-prompt-generation.ts";
import type { CompanionModelRef } from "@/types/companion.ts";

const mockModelRef: CompanionModelRef = {
  id: "test-model",
  name: "Test Model",
  author: "Test Author",
};

describe("buildGenerationPrompt", () => {
  it("includes the user's instructions verbatim", () => {
    const instructions = "A helpful coding assistant that explains concepts clearly";
    const prompt = buildGenerationPrompt(instructions, mockModelRef);
    expect(prompt).toContain(instructions);
  });

  it("includes the model name in context", () => {
    const prompt = buildGenerationPrompt("Test instructions", mockModelRef);
    expect(prompt).toContain("Test Model");
  });

  it("asks for JSON output with 'prompt' key", () => {
    const prompt = buildGenerationPrompt("Test instructions", mockModelRef);
    expect(prompt).toContain('"prompt"');
    expect(prompt).toContain("JSON");
  });
});

describe("GENERATION_SCHEMA", () => {
  it("defines a required 'prompt' string property", () => {
    expect(GENERATION_SCHEMA.type).toBe("object");
    expect(GENERATION_SCHEMA.properties?.prompt?.type).toBe("string");
    expect(GENERATION_SCHEMA.required).toContain("prompt");
  });
});