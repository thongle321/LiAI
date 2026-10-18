/** Companion export/import JSON codec (local only).
 *
 *  Pure — the envelope, validation and fresh-id rule are node-tested;
 *  the share sheet and the document picker live in the device glue
 *  (services/companions//share-companions.ts, hooks side).
 *
 *  Format: `{ kind: "liai-companions", version: 1, companions: [...] }`. ids and
 *  timestamps are STRIPPED on export and never read on import — a companion
 *  file is data, not a database dump, so importing twice yields two
 *  independent copies (the same rule the chat import keeps).
 */

import type { Companion } from "@/types/companion.ts";
import type { SeedableCompanion } from "@/services/companions/builtins.ts";

export const COMPANIONS_EXPORT_KIND = "liai-companions";
export const COMPANIONS_EXPORT_VERSION = 1;

export function toCompanionsJson(companions: Companion[]): string {
  const stripped = companions.map((companion) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = companion;
    return rest;
  });
  return JSON.stringify(
    { kind: COMPANIONS_EXPORT_KIND, version: COMPANIONS_EXPORT_VERSION, companions: stripped },
    null,
    2,
  );
}

export function companionExportFilename(companion?: Companion): string {
  const slug = (companion?.name ?? "companions")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `liai-${slug === "" ? "companions" : slug}-companions.json`;
}

export type ParsedCompanions =
  | { companions: SeedableCompanion[]; skipped: number }
  | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One entry of the file → a create-able companion, or null when unusable. */
function toSeedable(raw: unknown): SeedableCompanion | null {
  if (!isRecord(raw)) return null;
  if (typeof raw["name"] !== "string" || raw["name"].trim() === "") return null;
  if (typeof raw["systemPrompt"] !== "string") return null;
  // Pass the whole record through minus id/timestamps: an unknown field
  // from a FUTURE export version rides along harmlessly, and a required
  // field that is missing is caught by the two checks above (everything
  // else on Companion is optional).
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = raw;
  // SAFETY: the two checks above prove the only fields Companion REQUIRES
  //  (name: non-empty string, systemPrompt: string); every other Companion
  //  field is optional, so a record missing them is a shape Companion can
  //  hold, and create-time validation (the companions store) guards again.
  return rest as unknown as SeedableCompanion;
}

export function parseCompanionsJson(raw: string): ParsedCompanions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That file is not valid JSON." };
  }
  if (!isRecord(parsed) || parsed["kind"] !== COMPANIONS_EXPORT_KIND) {
    return { error: "That file is not a LiAI companions export." };
  }
  const list = parsed["companions"];
  if (!Array.isArray(list)) {
    return { error: "That companions file has no companion list." };
  }
  const companions: SeedableCompanion[] = [];
  let skipped = 0;
  for (const entry of list) {
    const companion = toSeedable(entry);
    if (companion === null) skipped += 1;
    else companions.push(companion);
  }
  if (companions.length === 0) {
    return { error: "That companions file contains no usable companions." };
  }
  return { companions, skipped };
}
