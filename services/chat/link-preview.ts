/** Link previews for URLs in chat messages (ADR-004 narrow exception).
 *
 * Uncredentialed public pages only, fetched from the app via
 * `link-preview-js/mobile` (Node-free entrypoint — no undici/node:net).
 * Anything needing a credential is never fetched. Failures stay silent:
 * a bubble without a preview is still a complete bubble.
 */

export interface LinkPreview {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  image?: string;
}

/** First http(s) URL in the text, trailing punctuation trimmed. */
export function firstUrl(text: string): string | null {
  const match = /https?:\/\/[^\s)]+/.exec(text);
  if (match === null) return null;
  return match[0].replace(/[.,!?;:]+$/, "");
}

/** Structural slice of a link-preview-js/mobile response we actually read. */
interface PreviewRow {
  url?: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
}

export type PreviewFetcher = (url: string) => Promise<PreviewRow>;

async function defaultFetcher(url: string): Promise<PreviewRow> {
  const { getLinkPreview } = await import("link-preview-js/mobile");
  // Rich metadata is nice-to-have; a slow page must not hold the bubble.
  const row = (await getLinkPreview(url, { timeout: 8000 })) as PreviewRow;
  return row;
}

/** Module-level cache/dedupe so scrolling a long thread doesn't re-fetch
 *  every link on each re-mount (D3-10 / D6-9). Concurrent and repeat reads
 *  for the same URL share one in-flight request. */
const previewCache = new Map<string, Promise<LinkPreview | null>>();

/** Normalized preview, or null when the page can't be previewed. */
export async function fetchPreview(
  url: string,
  fetcher: PreviewFetcher = defaultFetcher,
): Promise<LinkPreview | null> {
  // Only cache the default fetcher path; tests pass custom fetchers and
  // must not share state across cases.
  if (fetcher === defaultFetcher) {
    const cached = previewCache.get(url);
    if (cached) return cached;
    const promise = fetchPreviewImpl(url, fetcher);
    previewCache.set(url, promise);
    return promise;
  }
  return fetchPreviewImpl(url, fetcher);
}

async function fetchPreviewImpl(
  url: string,
  fetcher: PreviewFetcher,
): Promise<LinkPreview | null> {
  let row: PreviewRow;
  try {
    row = await fetcher(url);
  } catch {
    return null;
  }
  if (row === null || typeof row !== "object") return null;
  return {
    url: row.url ?? url,
    title: row.title,
    siteName: row.siteName,
    description: row.description,
    image: row.images?.[0],
  };
}
