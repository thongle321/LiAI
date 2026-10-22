/** Web-search provider registry (pure, tested).
 *
 * PocketParity (pocketpal-ai/src/store/SearchProviderStore.ts meta):
 * six providers. `requiresKey: false` means the provider works without a
 * key (the key only raises limits — You.com's free tier);
 * `selectable: false` means the provider is listed but cannot be the
 * active one (Parallel ships gated until its free-tier/PAYG terms are
 * confirmed). Keys live in SecureStore; only selection + preferences
 * persist in KV. The on-device search talent consumes this exact shape.
 */

import type { SearchProviderId } from "@/types/api.ts";

export interface SearchProviderMeta {
  id: SearchProviderId;
  name: string;
  /** False for providers that work without a key (the key only raises
   *  limits). Defaults to true. */
  requiresKey?: boolean;
  /** Gated providers appear in the picker but cannot be the active
   *  provider. Defaults to true. */
  selectable?: boolean;
}

export const SEARCH_PROVIDERS: SearchProviderMeta[] = [
  { id: "tavily", name: "Tavily" },
  { id: "brave", name: "Brave" },
  { id: "exa", name: "Exa" },
  { id: "firecrawl", name: "Firecrawl" },
  { id: "you", name: "You.com", requiresKey: false },
  { id: "parallel", name: "Parallel", selectable: false },
];

/** PocketParity default: Brave. */
export const DEFAULT_PROVIDER: SearchProviderId = "brave";
export const DEFAULT_RESULT_COUNT = 5;
export const MIN_RESULT_COUNT = 1;
export const MAX_RESULT_COUNT = 8;

export function searchKeySS(providerId: SearchProviderId): string {
  return `liai_search_key_${providerId}`;
}

const TOKENS: SearchProviderId[] = [
  "tavily",
  "brave",
  "exa",
  "firecrawl",
  "you",
  "parallel",
];

export function isSearchProviderId(value: unknown): value is SearchProviderId {
  return typeof value === "string" && TOKENS.some((id) => id === value);
}

/** Gated providers ship in the menu but never become active (PocketPal
 *  SearchProviderStore.setActiveProvider guard). Unknown ids refused too. */
export function isProviderSelectable(id: unknown): id is SearchProviderId {
  return isSearchProviderId(id) &&
    SEARCH_PROVIDERS.find((p) => p.id === id)?.selectable !== false;
}

export function parseResultCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_RESULT_COUNT;
  return Math.min(MAX_RESULT_COUNT, Math.max(MIN_RESULT_COUNT, Math.round(value)));
}
