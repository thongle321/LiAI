/** AI Prompt Generation: builds the prompt sent to the model and the
 *  JSON schema that constrains its output.
 *
 *  Pure logic — the engine call is a separate seam.
 */

import type { CompanionModelRef } from "@/types/companion.ts";

/** JSON schema the generation model must obey. */
export const GENERATION_SCHEMA = {
  type: "object",
  properties: {
    prompt: {
      type: "string",
      description: "The system prompt for the assistant scenario",
    },
  },
  required: ["prompt"],
} as const;

/** Build the generation prompt sent to the model. Matches PocketPal's
 *  `buildGenerationPrompt` in SystemPromptSection.tsx. */
export function buildGenerationPrompt(
  generatingPrompt: string,
  modelRef: CompanionModelRef,
): string {
  return [
    `You are an expert at writing system prompts for AI assistants.`,
    `The user wants to create a companion using "${modelRef.name}".`,
    `Generate a system prompt that captures their intent:`,
    ``,
    generatingPrompt,
    ``,
    `Requirements:`,
    `- Output ONLY a valid JSON object with a single key "prompt" containing the system prompt text.`,
    `- The prompt should be clear, specific, and actionable.`,
    `- Do not include any extra commentary or markdown.`,
    `- The prompt should work well for a chat assistant scenario.`,
  ].join("\n");
}

/** Result of a successful generation. */
export interface GenerationResult {
  prompt: string;
}

/** Call the engine with the generation prompt and schema.
 *  This is the seam the editor wires; the implementation lives in
 *  services/inference/ or a hook.
 *
 *  For now this is a stub — the real call uses the active engine
 *  (local or remote) via EngineManager. */
export async function callGenerationEngine(
  _prompt: string,
  _schema: object,
): Promise<GenerationResult | null> {
  // Implemented at the hook/engine layer
  return null;
}