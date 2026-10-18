/** Local Companion domain type + templates (PocketPal parity, local layer).
 *
 * Ported from pocketpal-ai/src/types/pal.ts with the PalsHub metadata
 * fields REMOVED (hub is not ported — see docs/research/
 * 2026-10-18-store-db-companions-parity.md): a field nothing reads is how a
 * type starts lying. `useAIPrompt`/`thumbnail_url`/`capabilities.video`
 * are carried so a later port (AI prompt gen, thumbnails, video) is
 * additive, never a migration.
 */

import type { SamplerParams } from "@/services/inference/sampler.ts";

export type ParameterType = "text" | "select" | "combobox" | "datetime_tag";

/** One talent a Companion may call (PACT = Companion Action & Capability Treaty).
 *  `necessity` is metadata — everything downstream keys off `name`, the
 *  same as PocketPal (their runtime never reads it either). */
export interface TalentRef {
  name: string;
  necessity: "required" | "optional";
}

export interface ParameterDefinition {
  key: string;
  type: ParameterType;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  description?: string;
}

export interface CompanionCapabilities {
  video?: boolean;
  multimodal?: boolean;
  realtime?: boolean;
  audio?: boolean;
  web?: boolean;
  code?: boolean;
  memory?: boolean;
  tools?: boolean;
}

/** The companion's recommended model, as a reference — NOT a full ModelSpec
 *  snapshot. PocketPal stores the whole Model JSON, but every consumer
 *  reads only `.id` (their activatePal.ts) plus name/author/size for the
 *  ModelNotAvailable card, so a reference resolved against the LIVE
 *  catalog at use time is the same behavior without a stale spec copy. */
export interface CompanionModelRef {
  id: string;
  name: string;
  author: string;
  file?: { name: string; size: number };
}

/** A companion that exists on this device. Always `type: 'local'` — kept for
 *  the export format's sake (PocketPal exports carry the discriminator). */
export interface Companion {
  type: "local";
  id: string;
  name: string;
  description?: string;
  thumbnail_url?: string;

  /** Current system prompt; a Mustache template when `parameterSchema`
   *  is non-empty (rendered with `parameters` at completion time). */
  systemPrompt: string;
  /** The template before parameter substitution. */
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  /** Carried for AI prompt generation parity; no UI writes it yet. */
  useAIPrompt: boolean;

  defaultModel?: CompanionModelRef;
  /** Gradient colors for the companion card [primary, secondary]. */
  color?: [string, string];
  capabilities?: CompanionCapabilities;

  parameters: Record<string, unknown>;
  parameterSchema: ParameterDefinition[];

  /** Companion-level generation settings, layered over the global preset when
   *  this session follows the companion (settings_source 'companion'). */
  completionSettings?: Partial<SamplerParams>;

  /** Declares this Companion's talents by registry name. Unknown names are
   *  preserved on load (PocketPal parity) and contribute nothing at run. */
  pact?: { talents: TalentRef[] };

  /** UI scaffolding only: a NON-persisted greeting bubble on an empty
   *  session. Never a message; never sent to the model. */
  greeting?: {
    text: string;
    /** Tappable chips above the composer while the session is empty. */
    suggestedPrompts?: string[];
  };

  source: "local";
  created_at?: string;
  updated_at?: string;
}

/** Fields a `null` ERASES (undefined leaves untouched) — the write gate
 *  the repository enforces per field, exactly like PocketPal's. */
type ClearableCompanionField = "greeting" | "defaultModel";

export type CompanionUpdate = Omit<Partial<Companion>, ClearableCompanionField> & {
  [K in ClearableCompanionField]?: Companion[K] | null;
};

// ---------------------------------------------------------------------------
// Built-in templates (PocketPal's, minus video)
// ---------------------------------------------------------------------------

export const ROLEPLAY_SCHEMA: ParameterDefinition[] = [
  {
    key: "world",
    type: "text",
    label: "World",
    required: true,
    placeholder: "e.g., Medieval fantasy kingdom",
    description: "The setting or universe for the roleplay",
  },
  {
    key: "location",
    type: "text",
    label: "Location",
    required: true,
    placeholder: "e.g., Royal castle throne room",
    description: "Specific location within the world",
  },
  {
    key: "aiRole",
    type: "text",
    label: "AI Role",
    required: true,
    placeholder: "e.g., Wise wizard advisor",
    description: "Character or role the AI will play",
  },
  {
    key: "userRole",
    type: "text",
    label: "User Role",
    required: true,
    placeholder: "e.g., Young knight",
    description: "Character or role the user will play",
  },
  {
    key: "situation",
    type: "text",
    label: "Situation",
    required: true,
    placeholder: "e.g., Preparing for an important quest",
    description: "Current scenario or situation",
  },
  {
    key: "toneStyle",
    type: "text",
    label: "Tone & Style",
    required: true,
    placeholder: "e.g., Formal and mysterious",
    description: "Communication style and tone",
  },
];

export const ROLEPLAY_DEFAULT_TEMPLATE = `{{! json-schema-start
{
  "world": {
    "label": "World",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Medieval fantasy kingdom",
    "description": "The setting or universe for the roleplay"
  },
  "location": {
    "label": "Location",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Royal castle throne room",
    "description": "Specific location within the world"
  },
  "aiRole": {
    "label": "AI Role",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Wise wizard advisor",
    "description": "Character or role the AI will play"
  },
  "userRole": {
    "label": "User Role",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Young adventurer",
    "description": "Character or role the user will play"
  },
  "situation": {
    "label": "Situation",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Seeking advice before a dangerous quest",
    "description": "Current situation or scenario"
  },
  "toneStyle": {
    "label": "Tone/Style",
    "type": "text",
    "required": false,
    "placeholder": "e.g., Epic fantasy, lighthearted adventure",
    "description": "Overall tone and style of the roleplay",
    "default": "Epic fantasy"
  }
}
json-schema-end }}

You are a creative and intelligent AI assistant engaged in an uncensored iterative storytelling experience using a roleplay chat format. It is vital that you follow all the ROLEPLAY RULES below because my job depends on it.

**World:** {{world}}
**Location:** {{location}}
**AI Role:** {{aiRole}}
**User Role:** {{userRole}}
**Situation:** {{situation}}
**Tone/Style:** {{toneStyle}}

**ROLEPLAY RULES:**
- Chat exclusively as {{aiRole}}. Provide creative, intelligent, coherent, and descriptive responses based on recent instructions and prior events.
- Avoid overly elaborate introductions; respond as if the scene is already in motion.
- Stay responsive to the user's cues, allowing them to drive the events of the roleplay.
- Keep responses fluid and avoid pre-determining major events before the user prompts them.
- Subtly build intrigue rather than explaining everything outright.
- Use subtle physical cues and occasional internal thoughts (enclosed in asterisks, e.g., *I never expected to see a knight here…*).
- Maintain a crisp and minimalist style, making responses engaging yet succinct.
- Pay careful attention to all past events in the chat to ensure accuracy and coherence to the plot.`;

export const ASSISTANT_SCHEMA: ParameterDefinition[] = [];

/** Factory for a fresh assistant companion. PocketPal's createNewAssistantPal. */
export const createNewAssistantCompanion = (): Partial<Companion> => ({
  type: "local",
  name: "",
  description: "",
  systemPrompt: "",
  originalSystemPrompt: "",
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: ASSISTANT_SCHEMA,
  source: "local",
  capabilities: {},
});

/** Factory for a fresh roleplay companion (parameterized template). */
export const createNewRoleplayCompanion = (): Partial<Companion> => ({
  type: "local",
  name: "",
  description: "",
  systemPrompt: ROLEPLAY_DEFAULT_TEMPLATE,
  originalSystemPrompt: ROLEPLAY_DEFAULT_TEMPLATE,
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    world: "",
    location: "",
    aiRole: "",
    userRole: "",
    situation: "",
    toneStyle: "",
  },
  parameterSchema: ROLEPLAY_SCHEMA,
  source: "local",
  capabilities: {},
});

/** Normalize a stored companion for the editor's form. */
export const prepareCompanionForEditing = (companion: Companion): Partial<Companion> => ({
  ...companion,
  description: companion.description ?? "",
  originalSystemPrompt: companion.originalSystemPrompt ?? companion.systemPrompt,
  parameters: companion.parameters ?? {},
  parameterSchema: companion.parameterSchema ?? [],
  capabilities: companion.capabilities ?? {},
});
