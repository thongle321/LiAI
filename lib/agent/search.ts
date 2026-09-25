/** On-device search: Tavily/Brave providers + budget clip + TTL cache.
 *
 * Ports the backend search module principle (providers behind one seam,
 * budget-trim the straddler, cache on provider+query+count so BYOK keys
 * never land in a key). Keys arrive per call from SecureStore via the
 * caller's getKey — this file never reads storage itself.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class ProviderError extends Error {}

/** Total snippet budget per search: trim the straddler, drop the rest. */
export const SEARCH_BUDGET_CHARS = 4000;

export function clipResults(
  results: SearchResult[],
  budget: number = SEARCH_BUDGET_CHARS,
): SearchResult[] {
  const clipped: SearchResult[] = [];
  let remaining = budget;
  for (const result of results) {
    if (remaining <= 0) break;
    const snippet = result.snippet.slice(0, remaining);
    remaining -= snippet.length;
    clipped.push({ title: result.title, url: result.url, snippet });
  }
  return clipped;
}

export interface CacheClock {
  now: () => number;
}

/** Tiny key→value cache with expiry and oldest-evict (single-owner use). */
export class TTLCache<K, V> {
  private rows = new Map<K, { expiresAt: number; value: V }>();
  private maxsize: number;
  private ttlMs: number;
  private clock: CacheClock;

  constructor(
    maxsize: number = 128,
    ttlMs: number = 300_000,
    clock: CacheClock = { now: () => Date.now() },
  ) {
    this.maxsize = maxsize;
    this.ttlMs = ttlMs;
    this.clock = clock;
  }

  get(key: K): V | null {
    const row = this.rows.get(key);
    if (!row) return null;
    if (this.clock.now() >= row.expiresAt) {
      this.rows.delete(key);
      return null;
    }
    return row.value;
  }

  set(key: K, value: V): void {
    if (this.rows.has(key)) this.rows.delete(key);
    while (this.rows.size >= this.maxsize) {
      const oldest = this.rows.keys().next().value;
      if (oldest === undefined) break;
      this.rows.delete(oldest);
    }
    this.rows.set(key, { expiresAt: this.clock.now() + this.ttlMs, value });
  }
}

export type HttpFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

const FETCH_TIMEOUT_MS = 15_000;

/** Provider call with timeout + status mapping; throws ProviderError. */
export async function providerJson(
  fetchImpl: HttpFetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!resp.ok) {
      throw new ProviderError(`search provider call failed: ${resp.status}`);
    }
    try {
      return (await resp.json()) as unknown;
    } catch (err) {
      throw new ProviderError(
        `search provider call failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(
      `search provider call failed: ${err instanceof Error ? err.message : err}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** First non-empty string under any of the keys (providers rename fields). */
export function rowText(
  row: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return "";
}

function rowsOf(payload: unknown, path: string[]): Record<string, unknown>[] {
  let node: unknown = payload;
  for (const key of path) {
    if (typeof node !== "object" || node === null) return [];
    node = (node as Record<string, unknown>)[key];
  }
  if (!Array.isArray(node)) return [];
  return node.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null,
  );
}

function mapRows(
  rows: Record<string, unknown>[],
  pick: (row: Record<string, unknown>) => SearchResult | null,
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const row of rows) {
    const mapped = pick(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Tavily POST /search; rows map title/url/content, tolerant of gaps. */
export async function tavilySearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
): Promise<SearchResult[]> {
  if (key.trim() === "") throw new ProviderError("search key is required");
  const payload = await providerJson(fetchImpl, "https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: count,
      search_depth: "basic",
    }),
  });
  return mapRows(rowsOf(payload, ["results"]), (row) => {
    const url = rowText(row, "url");
    if (!url) return null;
    return {
      title: rowText(row, "title") || url,
      url,
      snippet: rowText(row, "content"),
    };
  });
}

/** Brave GET web search; rows map title/url/description, tolerant of gaps. */
export async function braveSearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
): Promise<SearchResult[]> {
  if (key.trim() === "") throw new ProviderError("search key is required");
  const url =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}` +
    `&count=${count}`;
  const payload = await providerJson(fetchImpl, url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
  });
  return mapRows(rowsOf(payload, ["web", "results"]), (row) => {
    const rowUrl = rowText(row, "url");
    if (!rowUrl) return null;
    return {
      title: rowText(row, "title") || rowUrl,
      url: rowUrl,
      snippet: rowText(row, "description"),
    };
  });
}

const MIN_COUNT = 1;
const MAX_COUNT = 10;

const cache = new TTLCache<string, SearchResult[]>();

export type SearchFetcher = (
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
) => Promise<SearchResult[]>;

const FETCHERS: Record<string, SearchFetcher> = {
  tavily: tavilySearch,
  brave: braveSearch,
};

/** Dispatch, budget-clip, and share cached results across keys. */
export async function searchWeb(
  fetchImpl: HttpFetch,
  provider: string,
  key: string,
  query: string,
  count: number = 5,
): Promise<SearchResult[]> {
  const fetcher = FETCHERS[provider];
  if (!fetcher) throw new ProviderError(`unknown search provider: ${provider}`);
  if (key.trim() === "") throw new ProviderError("search key is required");
  if (query.trim() === "") return [];
  const clamped = Math.max(MIN_COUNT, Math.min(MAX_COUNT, count));
  const cacheKey = `${provider}::${clamped}::${query.trim()}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const results = await fetcher(fetchImpl, key, query.trim(), clamped);
  const clipped = clipResults(results, SEARCH_BUDGET_CHARS);
  cache.set(cacheKey, clipped);
  return clipped;
}
