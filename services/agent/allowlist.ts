/** Run-scoped read_url allowlist: only URLs the model legitimately saw.
 *
 * Ports the pocketpal/backend guard: web_search hits + user-written text
 * may be fetched; injected page content never enters the set. Normalized
 * (fragment dropped, host case folded) so transcription noise still
 * matches while query/path mutations do not.
 */

const allowed = new Set<string>();

function normalize(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  parsed.hash = "";
  return parsed.toString();
}

export function resetReadUrlAllowlist(): void {
  allowed.clear();
}

export function allowReadUrls(urls: Iterable<string>): void {
  for (const url of urls) {
    const normalized = normalize(url);
    if (normalized) allowed.add(normalized);
  }
}

export function isReadUrlAllowed(url: string): boolean {
  const normalized = normalize(url);
  return normalized !== null && allowed.has(normalized);
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]}]+/gi;

/** Extract http(s) URLs from free text (seeded from user messages). */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return matches.map((url) => url.replace(/[.,;:!?]+$/, ""));
}
