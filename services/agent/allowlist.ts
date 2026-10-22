/** Run-scoped read_url allowlist guarding prompt-injected exfiltration.
 *
 * PocketParity (pocketpal-ai/src/services/talents/readUrlAllowlist.ts):
 * sources of allowed URLs are (a) page sites the USER named — any page on
 * that host, (b) web_search hit URLs, and (c) the links a read_url result
 * carried. Match keys are canonical (fragment dropped, host case folded,
 * www stripped) and a lookup only ever returns a stored entry, so a key
 * collision can never fetch a string the run did not allow. A result's
 * fenced text is never parsed as the source of truth — injected text could
 * only add URLs a page visibly wrote through extractUrls.
 *
 * Seeded ONCE at run start (registry.ts calls seedReadUrlAllowlist with
 * the assembled messages and this session's persisted steps): user-role
 * texts from the conversation, search-hit URLs and read_url links from
 * stored turns, so a conversation restored after reload still admits the
 * URLs it once surfaced. Assistant text, tool arguments and fenced
 * summaries are never a source.
 */

import { URL_PATTERN } from "./search-budget.ts";

// Run-scoped: match key → stored canonical URL.
const allowed = new Map<string, string>();
const userSites = new Set<string>();

// RN types URL as read-only; the url polyfill installed at app start has
// setters.
type WritableUrl = URL & { hash: string; hostname: string };

// The RN URL polyfill does not lowercase hosts, so ASCII case is folded here.
const canonicalize = (raw: string): URL | null => {
  let parsed: WritableUrl;
  try {
    parsed = new URL(raw.trim()) as WritableUrl;
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  parsed.hash = "";
  if (/[A-Z]/.test(parsed.hostname)) {
    parsed.hostname = parsed.hostname.replace(/[A-Z]/g, (c) => c.toLowerCase());
  }
  return parsed;
};

const siteKey = (hostname: string): string => hostname.replace(/^www\./, "");

const matchKey = (url: URL): string =>
  siteKey(url.hostname) +
  (url.port ? ":" + url.port : "") +
  url.pathname.replace(/\/$/, "") +
  url.search;

export function resetReadUrlAllowlist(): void {
  allowed.clear();
  userSites.clear();
}

export function allowReadUrls(urls: Iterable<string>): void {
  for (const url of urls) {
    const canonical = canonicalize(url);
    if (canonical && !canonical.username && !canonical.password) {
      allowed.set(matchKey(canonical), canonical.toString());
    }
  }
}

export function matchReadUrl(url: string): string | null {
  const canonical = canonicalize(url);
  if (!canonical || canonical.username || canonical.password) {
    return null;
  }
  return (
    allowed.get(matchKey(canonical)) ??
    (userSites.has(siteKey(canonical.hostname)) ? canonical.toString() : null)
  );
}

export function isReadUrlAllowed(url: string): boolean {
  return matchReadUrl(url) !== null;
}

const TRAILING_PUNCTUATION =
  ".,;:!?\u2026\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF09\u300D\u300F\u3011";

const trimUrl = (url: string): string => {
  let opens = 0;
  let closes = 0;
  for (const char of url) {
    if (char === "(") {
      opens++;
    } else if (char === ")") {
      closes++;
    }
  }
  let end = url.length;
  const skipPunctuation = () => {
    while (end > 0 && TRAILING_PUNCTUATION.includes(url[end - 1])) {
      end--;
    }
  };
  skipPunctuation();
  // A ')' only ends the URL when it closes nothing the URL opened.
  while (url[end - 1] === ")" && opens < closes) {
    end--;
    closes--;
    skipPunctuation();
  }
  return url.slice(0, end);
};

/** Extract http(s) URLs from user or page text. */
export function extractUrls(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map(trimUrl);
}

// Breaks at Latin-1 symbols and at Hebrew-onward scripts, punctuation and
// emoji; Latin (with combining marks and Vietnamese), Greek, Cyrillic stay.
const USER_WORD = /[^\s"'`<>()[\]{}\u0080-\u00BF\u0590-\u1DBF\u2000-\uFFFF]+/g;
const USER_HOST = /^((?:[a-z0-9-]+\.)+[a-z]{2,63})\.*$/;
const USER_IP = /^(\d{1,3}(?:\.\d{1,3}){3})\.*$/;

function addUserSites(text: string): void {
  const words = text.replace(/[\uFE6B\uFF20]/g, "@").match(USER_WORD) ?? [];
  for (const word of words) {
    const bare = word.replace(/^https?:\/\//i, "");
    const head = bare.split(/[/?#]/)[0];
    if (head.includes("@")) {
      continue; // a URL userinfo is never a site name
    }
    for (const part of head.split(/[!$&*+,;=:|]/)) {
      const lower = part.toLowerCase();
      const host =
        USER_HOST.exec(lower)?.[1] ??
        (bare !== word ? USER_IP.exec(lower)?.[1] : undefined);
      if (host) {
        userSites.add(siteKey(host));
      }
    }
  }
}

/**
 * Run-start seed, the single definition of trusted sources: sites from
 * user-written text, and URLs from this session's persisted search hits
 * and read_url links. Structural step rows so the chat code can pass its
 * own `AgentStep` shapes. Rows that carry no hits/links contribute
 * nothing; a FAILED search's empty `hits` allow nothing.
 */
export function seedReadUrlAllowlist(
  assembledMessages: Array<{ role: string; content?: unknown }>,
  sessionRows: Array<{
    tool?: string;
    data?: { hits?: Array<{ url?: unknown }>; links?: unknown };
  }> = [],
): void {
  resetReadUrlAllowlist();
  for (const text of assembledMessages) {
    if (text.role !== "user") {
      continue;
    }
    if (typeof text.content === "string") {
      addUserSites(text.content);
    } else if (Array.isArray(text.content)) {
      for (const part of text.content) {
        if (part?.type === "text" && typeof part.text === "string") {
          addUserSites(part.text);
        }
      }
    }
  }
  for (const row of sessionRows) {
    const hits = row.data?.hits;
    if (Array.isArray(hits)) {
      allowReadUrls(
        hits.filter(
          (h): h is { url: string } =>
            typeof h === "object" && h !== null && typeof h.url === "string",
        ).map((h) => h.url),
      );
    }
    if (row.tool === "read_url" && Array.isArray(row.data?.links)) {
      allowReadUrls(
        (row.data?.links as unknown[]).filter(
          (link): link is string => typeof link === "string",
        ),
      );
    }
  }
}
