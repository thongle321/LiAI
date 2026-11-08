/** Human-readable labels + descriptions for the editor's talent list.
 *
 *  PocketPal's TalentSection iterates the talent registry and shows each
 *  tool's `function.description`. We do the same by reading from
 *  `talentDefinitions()` — the same definitions that drive the model.
 */

import { talentDefinitions } from "@/services/agent/registry.ts";

/** Map registry name → label (PocketPal's TalentSection uses i18n keys;
 *  we inline the English strings since LiAI ships no other locale). */
const LABELS: Record<string, string> = {
  datetime: "Date & Time",
  calculate: "Calculator",
  web_search: "Web Search",
  read_url: "Read URL",
  render_html: "Render HTML",
};

/** Label for a talent name. Unknown names fall back to a readable form. */
export function talentLabel(name: string): string {
  return LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Description from the tool definition. Empty for unknown names. */
export function talentDescription(name: string): string {
  const defs = talentDefinitions();
  const def = defs.find((d) => d.function.name === name);
  return def?.function.description ?? "";
}