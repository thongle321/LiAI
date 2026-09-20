/** Per-model settings defaults + safe parsing (persisted as JSON). */

import type { ModelSettings } from "../types/models";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  displayName: "",
  systemPrompt: "",
  stopWords: [],
};

export function parseModelSettings(value: unknown): ModelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_MODEL_SETTINGS };
  }
  const v = value as Record<string, unknown>;
  return {
    displayName: typeof v.displayName === "string" ? v.displayName : "",
    systemPrompt: typeof v.systemPrompt === "string" ? v.systemPrompt : "",
    stopWords: Array.isArray(v.stopWords)
      ? v.stopWords.filter((w): w is string => typeof w === "string")
      : [],
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
