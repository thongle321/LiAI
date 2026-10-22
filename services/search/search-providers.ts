/** Web-search provider abstraction (pure, tested).
 *
 * Two providers prove the shape isn't single-vendor. Keys live in
 * SecureStore; only selection + preferences persist in KV. The on-device
 * search talent consumes this exact shape.
 */

import type { SearchProviderId } from "@/types/api.ts";

export interface SearchProviderMeta {
  id: SearchProviderId;
  name: string;
}

export const SEARCH_PROVIDERS: SearchProviderMeta[] = [
  { id: "tavily", name: "Tavily" },
  { id: "brave", name: "Brave" },
];

export const DEFAULT_PROVIDER: SearchProviderId = "tavily";
export const DEFAULT_RESULT_COUNT = 5;
export const MIN_RESULT_COUNT = 1;
export const MAX_RESULT_COUNT = 8;

export function searchKeySS(providerId: SearchProviderId): string {
  return `liai_search_key_${providerId}`;
}

export function isSearchProviderId(value: unknown): value is SearchProviderId {
  return value === "tavily" || value === "brave";
}

export function parseResultCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_RESULT_COUNT;
  return Math.min(MAX_RESULT_COUNT, Math.max(MIN_RESULT_COUNT, Math.round(value)));
}
