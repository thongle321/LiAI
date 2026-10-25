/** Provider adapters for the on-device search talents.
 *
 * PocketParity (pocketpal-ai/src/services/search/providers/**): six
 * providers behind one fetch seam. Each adapter maps the provider's
 * smallest faithful body field to `snippet`, tolerates absent fields by
 * dropping the row, and throws — never a silent empty. Transport keeps
 * the reference app's guarantees: 12s deadline, 2MB body cap (a hostile/
 * oversized response must not OOM a device holding a multi-GB model),
 * and one retry on 429 honoring Retry-After hints up to 2s. Keys arrive
 * per call from SecureStore via the caller — this file never reads
 * storage, and a provider whose key is required throws a labeled
 * message rather than returning empty.
 *
 * PocketParity note: TTL and size clipping live at the TALENT layer
 * (search-budget.ts); adapters return the raw mapped rows.
 */

import type { PageContent, SearchHit } from "./search-budget.ts";

export interface SearchResult extends SearchHit {}

export class ProviderError extends Error {}

/** PocketParity http.ts: 12s deadline + 2MB body cap. */
export const FETCH_TIMEOUT_MS = 12_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export const requireKey = (key: string, providerLabel: string): string => {
  if (!key || key.trim().length === 0) {
    throw new ProviderError(`${providerLabel} key not set`);
  }
  return key.trim();
};

/** One retry on 429, honoring the server's hint when it asks for a wait
 *  of at most 2s; otherwise a fixed 1s. Longer asks are not followed. */
const DEFAULT_RETRY_WAIT_MS = 1000;
const MAX_RETRY_WAIT_MS = 2000;

const parseSecondsMs = (value: string): number | null =>
  /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : null;

const retryAfterMs = (value: string): number | null => {
  const seconds = parseSecondsMs(value);
  if (seconds !== null) {
    return seconds;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : date - Date.now();
};

const rateLimitResetMs = (value: string): number | null => {
  const waits = value
    .split(",")
    .map(parseSecondsMs)
    .filter((ms): ms is number => ms !== null);
  return waits.length > 0 ? Math.min(...waits) : null;
};

const rateLimitRetryWaitMs = (res: Response): number | null => {
  const retryAfter = res.headers?.get?.("retry-after");
  const reset =
    res.headers?.get?.("x-ratelimit-reset") ?? res.headers?.get?.("ratelimit-reset");
  const hint =
    retryAfter != null
      ? retryAfterMs(retryAfter)
      : reset != null
        ? rateLimitResetMs(reset)
        : null;
  if (hint === null || hint < 0) {
    return DEFAULT_RETRY_WAIT_MS;
  }
  return hint <= MAX_RETRY_WAIT_MS ? hint : null;
};

const waitOrCancel = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("cancelled"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort);
  });

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

const withTimeout = async (
  fetchImpl: HttpFetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const callerSignal = init.signal;
  if (callerSignal?.aborted) {
    throw new Error("cancelled");
  }
  const controller = new AbortController();
  let firedBy: "caller" | "timer" | undefined;
  const fire = (source: "caller" | "timer") => {
    firedBy ??= source;
    controller.abort();
  };
  const onCallerAbort = () => fire("caller");
  const timer = setTimeout(() => fire("timer"), timeoutMs);
  callerSignal?.addEventListener("abort", onCallerAbort);
  try {
    return await fetchImpl(input, {
      ...init,
      credentials: "omit",
      signal: controller.signal,
    });
  } catch (e) {
    if (firedBy === "caller") {
      throw new Error("cancelled");
    }
    if (firedBy === "timer") {
      throw new Error("timed out");
    }
    throw e;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
};

const assertWithinDeclaredSize = (res: Response): void => {
  const declared = res.headers?.get?.("content-length");
  if (declared) {
    const bytes = Number(declared);
    if (Number.isFinite(bytes) && bytes > MAX_BODY_BYTES) {
      throw new Error("response too large");
    }
  }
};

export async function providerJson(
  fetchImpl: HttpFetch,
  url: string,
  init: RequestInit,
  {
    timeoutMs = FETCH_TIMEOUT_MS,
    retryOn429 = false,
  }: { timeoutMs?: number; retryOn429?: boolean } = {},
): Promise<unknown> {
  let res: Response;
  try {
    res = await withTimeout(fetchImpl, url, init, timeoutMs);
    const retryWaitMs =
      retryOn429 && res.status === 429 ? rateLimitRetryWaitMs(res) : null;
    if (retryWaitMs !== null) {
      await waitOrCancel(retryWaitMs, init.signal);
      res = await withTimeout(fetchImpl, url, init, timeoutMs);
    }
  } catch (err) {
    throw new ProviderError(
      err instanceof Error ? err.message : String(err),
    );
  }
  if (!res.ok) {
    throw new ProviderError(`request failed (${res.status})`);
  }
  assertWithinDeclaredSize(res);
  // RN fetch can't stream-cap; bound the text before JSON.parse so an
  // unsized over-cap body isn't parsed into an even larger object.
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw new ProviderError(
      `request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (text.length > MAX_BODY_BYTES) {
    throw new ProviderError("response too large");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new ProviderError(
      `unexpected response: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Reader transport for the default reader (r.jina.ai): plain text with
 *  the same 12s deadline and a body clamp (RN fetch is XHR-backed, so the
 *  cap limits the OUTPUT, not the peak buffer). */
export async function fetchText(
  fetchImpl: HttpFetch,
  input: string,
  init: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<string> {
  const res = await withTimeout(fetchImpl, input, init, timeoutMs).catch(
    (err: unknown) => {
      throw new ProviderError(
        err instanceof Error ? err.message : String(err),
      );
    },
  );
  if (!res.ok) {
    throw new ProviderError(`request failed (${res.status})`);
  }
  assertWithinDeclaredSize(res);
  const text = await res.text();
  return text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
}

/** First non-empty string under any of the keys (providers rename fields). */
export function rowText(row: Record<string, unknown>, ...keys: string[]): string {
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
    const carrier = node as Record<string, unknown>;
    // Own-property guard: JSON.parse'd rows are walked by our literal
    // path segments only, and an inherited (prototype) key must never
    // travel down the walk.
    if (!Object.prototype.hasOwnProperty.call(carrier, key)) return [];
    node = carrier[key];
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

function publishedOf(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = rowText(row, ...keys);
  return value !== "" ? value : undefined;
}

/** Tavily POST /search; rows map title/url/content, tolerant of gaps. */
export async function tavilySearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  requireKey(key, "Tavily");
  const payload = await providerJson(
    fetchImpl,
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key.trim(),
        query,
        max_results: count,
        search_depth: "basic",
      }),
      signal,
    },
    { retryOn429: true },
  );
  if (!Array.isArray((payload as { results?: unknown[] })?.results)) {
    throw new ProviderError("unexpected response");
  }
  return mapRows(rowsOf(payload, ["results"]), (row) => {
    const url = rowText(row, "url");
    if (!url) return null;
    return {
      title: rowText(row, "title"),
      url,
      snippet: rowText(row, "content"),
      ...publishedOf(row, "published_date")
        ? { publishedAt: rowText(row, "published_date") }
        : {},
    };
  });
}

/** Brave GET web search; `type: 'search'` is the shape check the
 *  reference adapter makes. `page_age` → publishedAt. */
export async function braveSearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  requireKey(key, "Brave");
  const url =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}` +
    `&count=${count}`;
  const payload = await providerJson(
    fetchImpl,
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key.trim(),
      },
      signal,
    },
    { retryOn429: true },
  );
  if ((payload as { type?: unknown })?.type !== "search") {
    throw new ProviderError("unexpected response");
  }
  return mapRows(rowsOf(payload, ["web", "results"]), (row) => {
    const rowUrl = rowText(row, "url");
    if (!rowUrl) return null;
    return {
      title: rowText(row, "title"),
      url: rowUrl,
      snippet: rowText(row, "description"),
      ...(publishedOf(row, "page_age")
        ? { publishedAt: rowText(row, "page_age") }
        : {}),
    };
  });
}

interface ExaResult {
  title?: string;
  url?: string;
  highlights?: string[];
  summary?: string;
  text?: string;
  publishedDate?: string;
}

/** Pick Exa's smallest faithful body field: highlights → summary → text. */
const exaSnippet = (r: ExaResult): string => {
  if (r.highlights && r.highlights.length > 0) {
    return r.highlights.join(" ");
  }
  return r.summary ?? r.text ?? "";
};

export async function exaSearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  requireKey(key, "Exa");
  const payload = await providerJson(
    fetchImpl,
    "https://api.exa.ai/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key.trim() },
      body: JSON.stringify({
        query,
        numResults: count,
        contents: { highlights: true, summary: true },
      }),
      signal,
    },
    { retryOn429: true },
  );
  if (!Array.isArray((payload as { results?: unknown[] })?.results)) {
    throw new ProviderError("unexpected response");
  }
  return mapRows(rowsOf(payload, ["results"]), (row) => {
    const url = rowText(row, "url");
    if (!url) return null;
    return {
      title: rowText(row, "title"),
      url,
      snippet: exaSnippet(row as ExaResult),
      ...(publishedOf(row, "publishedDate")
        ? { publishedAt: rowText(row, "publishedDate") }
        : {}),
    };
  });
}

/** Exa native deep-read (POST /contents) — the one provider reader Exa
 *  ships. Absent text means "no usable content", and the TALENT turns it
 *  into its own error, so here we just map. */
export async function exaRead(
  fetchImpl: HttpFetch,
  key: string,
  url: string,
  signal?: AbortSignal,
): Promise<PageContent> {
  requireKey(key, "Exa");
  const payload = await providerJson(
    fetchImpl,
    "https://api.exa.ai/contents",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key.trim() },
      body: JSON.stringify({ urls: [url], text: true }),
      signal,
    },
  );
  const results = (payload as { results?: ExaResult[] })?.results;
  if (!Array.isArray(results)) {
    throw new ProviderError("unexpected response");
  }
  const first = results[0];
  return {
    url,
    ...(first?.title ? { title: first.title } : {}),
    text: first?.text ?? "",
  };
}

const FIRECRAWL_ORIGIN = "liai";

async function firecrawlPost(
  fetchImpl: HttpFetch,
  key: string,
  path: string,
  body: Record<string, unknown>,
  { retryOn429, signal }: { retryOn429?: boolean; signal?: AbortSignal } = {},
): Promise<unknown> {
  requireKey(key, "Firecrawl");
  return providerJson(
    fetchImpl,
    `https://api.firecrawl.dev/v2${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key.trim()}`,
      },
      body: JSON.stringify({ ...body, origin: FIRECRAWL_ORIGIN }),
      signal,
    },
    { retryOn429 },
  );
}

export async function firecrawlSearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const payload = await firecrawlPost(
    fetchImpl,
    key,
    "/search",
    { query, limit: count },
    { retryOn429: true, signal },
  );
  const data = (payload as { success?: boolean; data?: { web?: unknown } }) ?? {};
  if (data.success !== true || !data.data) {
    throw new ProviderError("unexpected response");
  }
  return mapRows(rowsOf(payload, ["data", "web"]), (row) => {
    const url = rowText(row, "url");
    if (!url) return null;
    return {
      title: rowText(row, "title"),
      url,
      snippet: rowText(row, "description"),
    };
  });
}

const SCRAPE_SERVER_TIMEOUT_MS = 10000;

export async function firecrawlRead(
  fetchImpl: HttpFetch,
  key: string,
  url: string,
  signal?: AbortSignal,
): Promise<PageContent> {
  const payload = await firecrawlPost(
    fetchImpl,
    key,
    "/scrape",
    {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: SCRAPE_SERVER_TIMEOUT_MS,
    },
    { signal },
  );
  const data = (payload as { success?: boolean; data?: {
    markdown?: string;
    metadata?: { title?: string; statusCode?: number };
  } | null }) ?? {};
  if (data.success !== true || !data.data) {
    throw new ProviderError("scrape failed");
  }
  const code = data.data.metadata?.statusCode;
  if (code !== undefined && code >= 400) {
    throw new ProviderError(`page returned ${code}`);
  }
  return {
    url,
    ...(data.data.metadata?.title ? { title: data.data.metadata.title } : {}),
    text: data.data.markdown ?? "",
  };
}

/** No key: You.com's free search (100 searches/day). With a key: the
 *  keyed Search API, for higher limits. Exported for tests. */
export const YOU_FREE_URL = "https://api.you.com/v1/agents/search";
export const YOU_KEYED_URL = "https://ydc-index.io/v1/search";

/** Attribution token appended to the app UA, on You.com requests only. */
const YOU_UA_TOKEN = "youdotcom-integration/a-ghorbani-pocketpal-ai";
/** App UA prefix (pocketpal's hfUserAgent(), brand-swapped). Static so
 *  the module stays pure — no expo-constants/native read at call time. */
const APP_UA = "LiAI (dev.liai)";

export const YOU_FREE_LIMIT_MESSAGE =
  "You.com free search limit reached (100 searches a day). Add a You.com API key in Settings → Internet Search for higher limits.";
export const YOU_KEYED_LIMIT_MESSAGE =
  "You.com rate limit reached. Try again shortly.";

interface YouWebResult {
  title?: string;
  url?: string;
  description?: string;
  snippets?: string[];
  page_age?: string;
}

export async function youSearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const trimmed = (key ?? "").trim();
  const params = `query=${encodeURIComponent(query)}&count=${count}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": `${APP_UA} ${YOU_UA_TOKEN}`,
  };
  if (trimmed !== "") {
    headers["X-API-Key"] = trimmed;
  }
  let payload: unknown;
  try {
    payload = await providerJson(
      fetchImpl,
      `${trimmed !== "" ? YOU_KEYED_URL : YOU_FREE_URL}?${params}`,
      { method: "GET", headers, signal },
      { retryOn429: true },
    );
  } catch (e) {
    if (e instanceof Error && e.message === "request failed (429)") {
      throw new ProviderError(trimmed !== "" ? YOU_KEYED_LIMIT_MESSAGE : YOU_FREE_LIMIT_MESSAGE);
    }
    throw e;
  }
  const results = (payload as { results?: { web?: unknown } })?.results;
  if (!results || typeof results !== "object") {
    throw new ProviderError("unexpected response");
  }
  if (!Array.isArray(results.web)) {
    throw new ProviderError("unexpected response");
  }
  return mapRows(results.web, (raw) => {
    const r = raw as YouWebResult;
    if (typeof r.url !== "string" || r.url === "") return null;
    return {
      title: r.title ?? "",
      url: r.url,
      snippet: r.description || r.snippets?.[0] || "",
      ...(r.page_age ? { publishedAt: r.page_age } : {}),
    };
  });
}

export async function parallelSearch(
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  requireKey(key, "Parallel");
  const payload = await providerJson(
    fetchImpl,
    "https://api.parallel.ai/v1/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key.trim() },
      body: JSON.stringify({ objective: query, max_results: count }),
      signal,
    },
    { retryOn429: true },
  );
  if (!Array.isArray((payload as { results?: unknown[] })?.results)) {
    throw new ProviderError("unexpected response");
  }
  return mapRows(rowsOf(payload, ["results"]), (row) => {
    const url = rowText(row, "url");
    if (!url) return null;
    const excerpts = row.excerpts;
    const excerptText = Array.isArray(excerpts)
      ? excerpts.filter((s): s is string => typeof s === "string").join(" ")
      : "";
    return {
      title: rowText(row, "title"),
      url,
      snippet: excerptText,
      ...(publishedOf(row, "published_date")
        ? { publishedAt: rowText(row, "published_date") }
        : {}),
    };
  });
}

const MIN_COUNT = 1;
const MAX_COUNT = 10;

export type SearchFetcher = (
  fetchImpl: HttpFetch,
  key: string,
  query: string,
  count: number,
  signal?: AbortSignal,
) => Promise<SearchResult[]>;

export const FETCHERS: Record<string, SearchFetcher> = {
  tavily: tavilySearch,
  brave: braveSearch,
  exa: exaSearch,
  firecrawl: firecrawlSearch,
  you: youSearch,
  parallel: parallelSearch,
};

/** Dispatch the provider call. Clamping, caching, budgeting and the
 *  in-flight dedupe live with the TALENT (search-budget.ts + registry.ts)
 *  — this is a thin fetch pass. */
export async function searchWeb(
  fetchImpl: HttpFetch,
  provider: string,
  key: string,
  query: string,
  count: number = 5,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const fetcher = FETCHERS[provider];
  if (!fetcher) throw new ProviderError(`unknown search provider: ${provider}`);
  if (query.trim() === "") return [];
  const clamped = Math.max(MIN_COUNT, Math.min(MAX_COUNT, count));
  return fetcher(fetchImpl, key, query.trim(), clamped, signal);
}

/** Fallback reader for providers without a native read(): r.jina.ai
 *  returns clean plain text, no key (PocketPal readWithDefaultReader). */
export async function readWithDefaultReader(
  fetchImpl: HttpFetch,
  url: string,
  signal?: AbortSignal,
): Promise<PageContent> {
  const text = await fetchText(fetchImpl, `https://r.jina.ai/${encodeURI(url)}`, {
    method: "GET",
    signal,
  });
  return { url, text };
}

/** Native deep-read when the ACTIVE provider ships one; else the default
 *  reader. The reference index.ts routes by adapter — same seam. */
export async function readPage(
  fetchImpl: HttpFetch,
  provider: string,
  key: string,
  url: string,
  signal?: AbortSignal,
): Promise<PageContent> {
  if (provider === "exa") return exaRead(fetchImpl, key, url, signal);
  if (provider === "firecrawl") return firecrawlRead(fetchImpl, key, url, signal);
  return readWithDefaultReader(fetchImpl, url, signal);
}
