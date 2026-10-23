/** Result budgeting for the search talents — pure, no network/storage.
 *
 * PocketParity (pocketpal-ai/src/services/search/searchBudget.ts): web
 * content is sized by TOKENS against the talent's context ceiling, and the
 * MODEL-VISIBLE renderer is the thing that gets charged — markup and
 * indentation count toward the budget. Hits are dropped whole, never
 * truncated mid-fact; a straddler dies rather than arriving cut in half.
 * Also owns the search-hit cache: LRU (50), NO ttl, budgeted hits only —
 * a key never lands in a cache key, and invalidation on key/consent/
 * provider change is explicit (`resetSearchCache`, called by the store).
 */

/** ~4 chars per token (rough heuristic). */
const CHARS_PER_TOKEN = 4;

export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / CHARS_PER_TOKEN);

export const URL_PATTERN = /https?:\/\/[^\s"'<>\]}]+/gi;
const URL_OR_MARKUP = new RegExp(`(${URL_PATTERN.source})|[*_\`#>~]+`, "gi");

const stripTrailingEmphasis = (url: string): string => {
  let end = url.length;
  while (end > 0 && ".,;:!?)".includes(url[end - 1])) {
    end--;
  }
  let start = end;
  while (start > 0 && "*_`~".includes(url[start - 1])) {
    start--;
  }
  return start < end ? url.slice(0, start) + " " + url.slice(end) : url;
};

/** Third-party body → plain text: HTML tags out, markdown images out,
 *  links collapse to their label, emphasis/heading markers out, URL spans
 *  kept, whitespace collapsed. The URL punctuation fix lives in
 *  allowlist.ts's trimUrl — this copy keeps URL spans intact. */
const toPlainText = (raw: string): string =>
  raw
    .replace(/<[^>]*>/g, " ") // HTML tags
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ") // markdown images
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1") // markdown links → label
    .replace(URL_OR_MARKUP, (_match, url?: string) =>
      url ? stripTrailingEmphasis(url) : " ",
    ) // markdown emphasis / heading markers, URL spans kept
    .replace(/\s+/g, " ")
    .trim();

/** Drop a trailing unpaired high surrogate so a slice never splits an emoji. */
const stripTrailingHighSurrogate = (text: string): string => {
  const last = text.charCodeAt(text.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    return text.slice(0, -1);
  }
  return text;
};

/** Word-boundary cut; for space-less scripts (CJK/Thai) falls back to a char
 *  boundary, never splitting a surrogate pair. Ellipsis marks the cut. */
export const truncateOnWordBoundary = (
  text: string,
  maxChars: number,
): string => {
  if (maxChars <= 0) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut =
    lastSpace > 0 ? slice.slice(0, lastSpace) : stripTrailingHighSurrogate(slice);
  return `${cut.trimEnd()}…`;
};

/** Per-field caps so no single provider-controlled field can blow the
 *  token ceiling; a clamped legit hit always fits. URLs are dropped rather
 *  than truncated — a cut URL would be uncopyable for read_url. */
export const TITLE_MAX_CHARS = 200;
export const URL_MAX_CHARS = 2048;

export interface SearchHit {
  title: string;
  /** Canonical result URL — always kept (citation + read_url target). */
  url: string;
  /** Smallest faithful body field the provider offers, as plain text. */
  snippet: string;
  /** ISO date, if provided. */
  publishedAt?: string;
}

export interface PageContent {
  url: string;
  title?: string;
  /** Plain-text page body, pre-budget. */
  text: string;
}

export interface SearchBudget {
  /** From settings (default 5). */
  maxResults: number;
  /** ~280 chars per snippet. */
  perSnippetChars: number;
  /** The talent's recommendedContextTokens — the result token ceiling. */
  tokenCeiling: number;
}

/**
 * `renderHit` must be the exact renderer fed to the model: the token
 * ceiling is charged against rendered text (markup/indentation count).
 */
export const budgetHits = (
  hits: SearchHit[],
  budget: SearchBudget,
  renderHit: (hit: SearchHit) => string,
): SearchHit[] => {
  const capped = hits
    .filter((hit) => hit.url.length <= URL_MAX_CHARS)
    .slice(0, Math.max(0, budget.maxResults));

  const cleaned: SearchHit[] = capped.map((hit) => ({
    title: truncateOnWordBoundary(toPlainText(hit.title), TITLE_MAX_CHARS),
    url: hit.url,
    snippet: truncateOnWordBoundary(
      toPlainText(hit.snippet),
      budget.perSnippetChars,
    ),
    ...(hit.publishedAt ? { publishedAt: hit.publishedAt } : {}),
  }));

  const out: SearchHit[] = [];
  let usedTokens = 0;
  for (const hit of cleaned) {
    const hitTokens = estimateTokens(renderHit(hit));
    if (usedTokens + hitTokens > budget.tokenCeiling) {
      break; // drop hits whole (even the first) — never truncate mid-fact
    }
    out.push(hit);
    usedTokens += hitTokens;
  }
  return out;
};

export const budgetPage = (
  page: PageContent,
  tokenCeiling: number,
): PageContent => {
  const text = toPlainText(page.text);
  const maxChars = Math.max(0, tokenCeiling) * CHARS_PER_TOKEN;
  return {
    url: page.url,
    // Clamp the provider-controlled title like search hits do, so no single
    // untrusted field can blow the page's rendered size.
    ...(page.title
      ? {
          title: truncateOnWordBoundary(
            toPlainText(page.title),
            TITLE_MAX_CHARS,
          ),
        }
      : {}),
    text: truncateOnWordBoundary(text, maxChars),
  };
};

/**
 * The BYOK key is deliberately NOT part of the cache key — a secret must
 * never land in a cache key; invalidation on key change is explicit
 * (`resetSearchCache`).
 */
const MAX_CACHE_ENTRIES = 50;
const searchCache = new Map<string, SearchHit[]>();

export const cacheKey = (
  providerId: string,
  query: string,
  maxResults: number,
): string => `${providerId}::${maxResults}::${query}`;

export const getCachedHits = (
  providerId: string,
  query: string,
  maxResults: number,
): SearchHit[] | undefined => searchCache.get(cacheKey(providerId, query, maxResults));

export const setCachedHits = (
  providerId: string,
  query: string,
  maxResults: number,
  hits: SearchHit[],
): void => {
  const key = cacheKey(providerId, query, maxResults);
  // Re-insert moves the key to newest so eviction stays LRU-ish on overwrite.
  searchCache.delete(key);
  searchCache.set(key, hits);
  if (searchCache.size > MAX_CACHE_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) {
      searchCache.delete(oldest);
    }
  }
};

export const resetSearchCache = (): void => {
  searchCache.clear();
};
