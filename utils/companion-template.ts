/** Companion Mustache templates: schema extraction + rendering.
 *
 * Port of pocketpal-ai/src/utils/palshub-template-parser.ts — minus the
 * `mustache` dependency. The templates this app renders use NOTHING but
 * `{{key}}` interpolation (the schema block is stripped before render;
 * sections, partials and inverted sections appear in no template the app
 * ships or imports), so a regex substitution is the whole job. Ponytail
 * shortcut: if a template ever needs sections/partials, add the real
 * mustache package rather than growing this.
 *
 * Pure module — node-testable, no React Native imports.
 */

import type { ParameterDefinition } from "@/types/companion.ts";

interface MustacheSchemaDefinition {
  type?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  default?: string;
  options?: string[];
}

export interface ParsedCompanionTemplate {
  cleanSystemPrompt: string;
  parameterSchema: ParameterDefinition[];
  defaultParameters: Record<string, unknown>;
}

/** `{{! json-schema-start { ... } json-schema-end }}` block, if any. */
const SCHEMA_BLOCK =
  /\{\{!\s*json-schema-start\s*([\s\S]*?)\s*json-schema-end\s*\}\}/;

function extractJsonSchema(
  template: string,
): Record<string, MustacheSchemaDefinition> | null {
  const match = template.match(SCHEMA_BLOCK);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as Record<string, MustacheSchemaDefinition>;
  } catch (error) {
    console.error("Failed to parse JSON schema from template:", error);
    return null;
  }
}

function cleanTemplate(template: string): string {
  return template.replace(new RegExp(SCHEMA_BLOCK.source, "g"), "").trim();
}

function convertSchema(
  schema: Record<string, MustacheSchemaDefinition>,
): ParameterDefinition[] {
  const out: ParameterDefinition[] = [];
  for (const [key, definition] of Object.entries(schema)) {
    if (typeof definition !== "object" || definition === null) continue;
    const type: ParameterDefinition["type"] =
      definition.type === "select" || definition.type === "combobox"
        ? definition.type
        : "text";
    const param: ParameterDefinition = {
      key,
      type,
      label: definition.label || key,
      required: definition.required || false,
    };
    if (definition.placeholder !== undefined) {
      param.placeholder = definition.placeholder;
    }
    if (definition.description !== undefined) {
      param.description = definition.description;
    }
    if (
      (type === "select" || type === "combobox") &&
      Array.isArray(definition.options)
    ) {
      param.options = definition.options;
    }
    out.push(param);
  }
  return out;
}

function defaultsFromSchema(
  schema: Record<string, MustacheSchemaDefinition>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(schema)) {
    if (typeof definition !== "object" || definition === null) continue;
    defaults[key] = definition.default === undefined ? "" : definition.default;
  }
  return defaults;
}

/** Split a templated prompt into clean prompt + schema + defaults. */
export function parseCompanionTemplate(template: string): ParsedCompanionTemplate {
  if (!template || typeof template !== "string") {
    return { cleanSystemPrompt: "", parameterSchema: [], defaultParameters: {} };
  }
  const schema = extractJsonSchema(template);
  return {
    cleanSystemPrompt: cleanTemplate(template),
    parameterSchema: schema ? convertSchema(schema) : [],
    defaultParameters: schema ? defaultsFromSchema(schema) : {},
  };
}

/** Values as Mustache sees them: datetimes resolved, arrays joined,
 *  booleans as Yes/No, null/undefined as empty string. */
function processParameters(
  parameters: Record<string, unknown>,
): Record<string, string> {
  const processed: Record<string, string> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (value === "{{datetime}}") {
      processed[key] = new Date().toLocaleString();
    } else if (Array.isArray(value)) {
      processed[key] = value.join(", ");
    } else if (typeof value === "boolean") {
      processed[key] = value ? "Yes" : "No";
    } else if (value == null) {
      processed[key] = "";
    } else {
      processed[key] = String(value);
    }
  }
  return processed;
}

/** Render `{{key}}` substitutions. An unset key renders empty (Mustache
 *  semantics). No HTML escaping — prompts are plain text. */
export function generateFinalSystemPrompt(
  template: string,
  parameters: Record<string, unknown>,
): string {
  if (!template || typeof template !== "string") return "";
  if (!parameters || typeof parameters !== "object") return template;
  const processed = processParameters(parameters);
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) =>
    Object.hasOwn(processed, key) ? processed[key] : whole,
  );
}
