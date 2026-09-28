/** Per-model settings defaults + safe parsing (persisted as JSON). */

import type { ModelSettings } from "../types/models";
import { DEFAULT_SAMPLER, type SamplerParams } from "./inference/sampler.ts";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  displayName: "",
  systemPrompt: "",
  stopWords: [],
};

/** Only the fields a model actually overrides; absent means "use global".
 *  A field that is not a finite number is not an override — it is dropped,
 *  so a corrupt or half-written save falls back to global rather than
 *  silently pinning the value to whatever the default happens to be. */
function parseSamplerOverride(value: unknown): Partial<SamplerParams> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SAMPLER) as Array<keyof SamplerParams>) {
    const raw = v[key];
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
  }
  return Object.keys(out).length > 0 ? (out as Partial<SamplerParams>) : null;
}

export function parseModelSettings(value: unknown): ModelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_MODEL_SETTINGS };
  }
  const v = value as Record<string, unknown>;
  const sampler = parseSamplerOverride(v.sampler);
  return {
    displayName: typeof v.displayName === "string" ? v.displayName : "",
    systemPrompt: typeof v.systemPrompt === "string" ? v.systemPrompt : "",
    stopWords: Array.isArray(v.stopWords)
      ? v.stopWords.filter((w): w is string => typeof w === "string")
      : [],
    // A partial override, so "unset" never freezes a value the user cannot see.
    ...(sampler ? { sampler } : {}),
  };
}

export function parseModelSettingsMap(raw: string | null): Record<string, ModelSettings> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, ModelSettings> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      out[key] = parseModelSettings(entry);
    }
    return out;
  } catch {
    return {};
  }
}
