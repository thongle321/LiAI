/** Editor draft → stored-companion fields (PocketPal's PalSheet `onSubmit`,
 *  separated from the form so the rules are node-testable).
 *
 *  Two write rules live here because the repository's merge gate makes them
 *  sharp edges:
 *  - `undefined` LEAVES a stored field alone, `null` ERASES it. Every cleared
 *    field (greeting, model, description, generation settings) therefore has
 *    to travel as `null`, never `undefined`.
 *  - `capabilities` belongs to the companion, not the form: editing must
 *    carry the stored value through instead of resetting it to `{}`.
 *
 *  The greeting follows PocketPal: text OR suggested prompts is enough to
 *  keep it, and an empty list is omitted rather than stored as `[]`.
 */

import { TALENT_NAMES } from "@/services/agent/registry.ts";
import { parseCompanionTemplate } from "@/utils/companion-template.ts";
import type {
  Companion,
  CompanionCapabilities,
  CompanionModelRef,
  ParameterDefinition,
} from "@/types/companion.ts";
import type { SamplerParams } from "@/services/inference/sampler.ts";

/** Everything the editor form edits. */
export interface CompanionEditorDraft {
  id: string | null;
  name: string;
  description: string;
  thumbnail: string; // maps to thumbnail_url in Companion
  systemPrompt: string;
  originalSystemPrompt: string;
  isSystemPromptChanged: boolean;
  parameters: Record<string, unknown>;
  parameterSchema: ParameterDefinition[];
  talentNames: Set<string>;
  greetingText: string;
  /** One prompt per line. */
  suggestedPrompts: string;
  color: readonly [string, string] | null;
  modelRef: CompanionModelRef | null;
  completionSettings: Partial<SamplerParams> | null;
  capabilities: CompanionCapabilities;
  // AI prompt generation fields
  useAIPrompt: boolean;
  promptGenerationModel: CompanionModelRef | null;
  generatingPrompt: string;
}

/** The companion fields minus the four the write path handles specially. */
export type CompanionWriteBase = Omit<
  Companion,
  | "id"
  | "created_at"
  | "updated_at"
  | "greeting"
  | "defaultModel"
  | "description"
  | "completionSettings"
>;

export interface CompanionWriteFields {
  base: CompanionWriteBase;
  /** `null` erases on update; create omits it. */
  greeting: Companion["greeting"] | null;
  /** `null` erases on update; create omits it. */
  defaultModel: CompanionModelRef | null;
  /** `null` erases on update; create omits it. */
  description: string | null;
  /** `null` resets to "follow the preset" on update; create omits it. */
  completionSettings: Partial<SamplerParams> | null;
  /** `null` erases on update; create omits it. */
  thumbnail: Companion["thumbnail_url"] | null;
}

export function buildCompanionFields(draft: CompanionEditorDraft): CompanionWriteFields {
  // A schema block in the prompt defines the parameters (roleplay ships one);
  // entered values win over schema defaults.
  const parsed = parseCompanionTemplate(draft.systemPrompt);
  const schema =
    parsed.parameterSchema.length > 0 ? parsed.parameterSchema : draft.parameterSchema;
  const parameters: Record<string, unknown> = { ...parsed.defaultParameters };
  for (const key of Object.keys(parameters)) {
    const entered = draft.parameters[key];
    if (typeof entered === "string" && entered !== "") parameters[key] = entered;
  }

  const talents = [...draft.talentNames]
    .filter((name) => (TALENT_NAMES as readonly string[]).includes(name))
    .map((name) => ({ name, necessity: "required" as const }));

  const text = draft.greetingText.trim();
  const prompts = draft.suggestedPrompts
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const greeting =
    text !== "" || prompts.length > 0
      ? { text, ...(prompts.length > 0 ? { suggestedPrompts: prompts } : {}) }
      : null;

  return {
    base: {
      type: "local",
      name: draft.name.trim(),
      systemPrompt: draft.systemPrompt,
      originalSystemPrompt: draft.originalSystemPrompt || draft.systemPrompt,
      isSystemPromptChanged:
        draft.systemPrompt !== (draft.originalSystemPrompt || draft.systemPrompt),
      useAIPrompt: false,
      parameters,
      parameterSchema: schema,
      capabilities: draft.capabilities,
      source: "local",
      pact: { talents },
      color: (draft.color as [string, string] | null) ?? undefined,
    },
    greeting,
    defaultModel: draft.modelRef,
    description: draft.description.trim() || null,
    completionSettings: draft.completionSettings,
    thumbnail: draft.thumbnail || null,
  };
}
