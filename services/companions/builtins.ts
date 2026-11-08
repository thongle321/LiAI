/** Builtin companion definitions (PocketPal parity, minus Lookie/video).
 *
 * Pure data — no store, no native import — so seeding is node-testable
 * and the definition is the single home for Pip's prompt.
 */

import type { Companion } from "@/types/companion.ts";

/** Pip's stored shape. The id and timestamps are the repository's. */
export type SeedableCompanion = Omit<Companion, "id" | "created_at" | "updated_at">;

/** PocketPal's Pip ships with NO pact: a first-run chat sends no tools.
 *  Tools are opt-in per companion through the editor's Tools section. */
export const PIP_COMPANION: SeedableCompanion = {
  type: "local",
  name: "Pip",
  description: "A friendly general-purpose companion that runs entirely on your phone.",
  systemPrompt:
    "You are Pip, a friendly and helpful assistant who runs locally on the user\u2019s phone. Keep replies concise and warm.",
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  capabilities: {},
  color: ["#0E0D0C", "#FAFAFA"],
  source: "local",
};
