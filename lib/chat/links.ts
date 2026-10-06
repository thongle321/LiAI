/** Openable-scheme guard for rendered links (C2).
 *
 * A markdown body is untrusted content: a rendered URL could carry
 * `file:`, `javascript:`, `data:` or a bare scheme. Only plain http(s)
 * may reach Linking — the exact rule PocketPal applies to search hits
 * (WebSearchResultsSheet.tsx:24), kept here as a pure function so the
 * rule is one decision point and node-testable. */

export function isOpenableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
