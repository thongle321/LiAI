/** Builtin companion definitions (PocketPal parity, minus Lookie/video).
 *
 * Pure data — no store, no native import — so seeding is node-testable
 * and the definition is the single home for Pip's prompt and pact.
 */

import type { Companion } from "@/types/companion.ts";

/** The five talents LiAI ships (services/agent//registry.ts). Pip
 *  carries all of them in her pact because per-companion gating means a chat
 *  with NO pact-listed talent gets NO tools — seeding the default companion
 *  with the full set is what keeps the first-run experience at today's
 *  always-on tools until the user trims her. */
export const ALL_TALENT_NAMES = [
  "datetime",
  "calculate",
  "web_search",
  "read_url",
  "render_html",
] as const;

/** Pip's stored shape. The id and timestamps are the repository's. */
export type SeedableCompanion = Omit<Companion, "id" | "created_at" | "updated_at">;

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
  pact: {
    talents: ALL_TALENT_NAMES.map((name) => ({ name, necessity: "required" as const })),
  },
};
