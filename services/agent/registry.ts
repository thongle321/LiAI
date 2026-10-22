/** Local talent registry: 5 on-device engines behind one seam (ADR-0009).
 *
 * Principles from pocketpal/backend, not the files: name-keyed lookup,
 * outcomes are strings never throws, web_search seeds the read_url
 * allowlist, everything third-party is fenced as untrusted data.
 */

import type { ToolDefinition } from "../inference/engine.ts";
import {
  allowReadUrls,
  extractUrls,
  matchReadUrl,
} from "./allowlist.ts";
import { budgetHits, budgetPage, cacheKey, getCachedHits, setCachedHits, type SearchHit } from "./search-budget.ts";
import { readPage, searchWeb, type HttpFetch } from "./search.ts";
import { calculate, localTime } from "./talents.ts";
import { fenceUntrusted } from "./untrusted.ts";

export interface TalentSearchAuth {
  provider: string;
  key: string;
  count: number;
}

export interface TalentContext {
  fetchImpl: HttpFetch;
  search: TalentSearchAuth | null;
}

/** PocketParity (talents/searchAccess.ts): the consent copy the MODEL
 *  gets when search has not been set up — it can relay the real fix. */
export const SEARCH_NOT_SET_UP_MESSAGE =
  "Internet search isn't set up yet. Finish setup in Settings → Internet Search.";

/** What a talent produced.
 *
 *  `ok: false` means the talent could not do its job — the content is the
 *  reason. This is what makes a FAILED tool distinguishable from one that
 *  succeeded. A failure is an OUTCOME, never an exception. */
export interface TalentOutcome {
  ok: boolean;
  content: string;
  /** Structured result, for the RENDERER only -- never for the model.
   *
   *  The model reads `content` and nothing else; the untrusted fence wraps
   *  that string and exists to stop prompt injection reaching the MODEL.
   *  A renderer is not a model, and React escapes text by default, so
   *  handing it the structured shape is safe. */
  data?: Record<string, unknown>;
}

const done = (
  content: string,
  data?: Record<string, unknown>,
): TalentOutcome => (data !== undefined ? { ok: true, content, data } : { ok: true, content });
const fail = (content: string): TalentOutcome => ({ ok: false, content });

/** Every talent name this build knows, in menu order. The pact vocabulary:
 *  a companion names these in `pact.talents`, and gating filters against
 *  this set (PocketPal's TalentRegistry names). */
export const TALENT_NAMES = [
  "datetime",
  "calculate",
  "web_search",
  "read_url",
  "render_html",
] as const;

export type TalentName = (typeof TALENT_NAMES)[number];

/** Context each talent wants beyond the prompt (PocketPal's
 *  `recommendedContextTokens`, same values): a hint for the load-hint
 *  snackbar, never a threshold that changes any behavior. */
const RECOMMENDED_CONTEXT: Partial<Record<TalentName, number>> = {
  web_search: 1000,
  read_url: 1200,
  render_html: 4096,
};

export function recommendedContextTokens(name: string): number | undefined {
  return name in RECOMMENDED_CONTEXT
    ? RECOMMENDED_CONTEXT[name as TalentName]
    : undefined;
}

/** PocketParity (WebSearchEngine/ReadUrlEngine): the exact schemas the
 *  reference app advertises — wording included, it is what teaches the
 *  model when to call. */
function definitionFor(name: TalentName): ToolDefinition {
  switch (name) {
    case "datetime":
      return {
        type: "function",
        function: {
          name: "datetime",
          description: "Get the current local date and time.",
          parameters: {
            type: "object",
            properties: {
              timezone: {
                type: "string",
                description: "IANA timezone, e.g. Asia/Ho_Chi_Minh",
              },
            },
          },
        },
      };
    case "calculate":
      return {
        type: "function",
        function: {
          name: "calculate",
          description: "Evaluate a mathematical expression and return the result.",
          parameters: {
            type: "object",
            properties: {
              expression: {
                type: "string",
                description: "Arithmetic, e.g. '2 + 3 * 4'",
              },
            },
            required: ["expression"],
          },
        },
      };
    case "web_search":
      return {
        type: "function",
        function: {
          name: "web_search",
          description:
            "Search the web for current information. Use this for any question about news, current events, prices, releases, sports, weather, or any fact that may have changed since your training data or that you are unsure about. Write short keyword queries (2-6 words), like a search engine user, not full sentences. Returns result titles, source URLs, and text snippets.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Short keyword search query, e.g. 'nobel prize physics 2026 winner'.",
              },
            },
            required: ["query"],
          },
        },
      };
    case "read_url":
      return {
        type: "function",
        function: {
          name: "read_url",
          description:
            "Fetch the full text of one web page. Use it directly when the user names a site or gives a URL; any page on a site the user named can be read. Also use it after web_search when a snippet does not fully answer, or to follow a URL written in a page you read. On other sites, copy the URL exactly from a web_search result or a page you read; do not invent URLs.",
          parameters: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description:
                  "A page on a site the user named, or a URL copied exactly from a web_search result or a page you read.",
              },
            },
            required: ["url"],
          },
        },
      };
    case "render_html":
      return {
        type: "function",
        function: {
          name: "render_html",
          description:
            "Render an HTML document inline as a visual preview in the chat.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Short label shown above the preview.",
              },
              html: {
                type: "string",
                description:
                  "Complete, self-contained HTML document or fragment to render.",
              },
            },
            required: ["html"],
          },
        },
      };
    default: {
      // Unreachable while the switch covers TalentName; a throw keeps it
      // honest if a name is ever added without a schema.
      const unknown: never = name;
      throw new Error(`no tool schema for talent: ${String(unknown)}`);
    }
  }
}

/** Tool schemas for a pact's talent names — PocketPal's
 *  deriveToolSchemas: a STRICT SUBSET. Unknown names contribute nothing
 *  (no validation, no error); an empty/absent list means no tools at all,
 *  which is exactly what a chat with no companion sends. */
export function deriveToolSchemas(names?: readonly string[]): ToolDefinition[] {
  if (names === undefined) return TALENT_NAMES.map(definitionFor);
  const wanted = new Set(names);
  const out: ToolDefinition[] = [];
  for (const name of TALENT_NAMES) {
    if (wanted.has(name)) out.push(definitionFor(name));
  }
  return out;
}

/** Back-compat alias: every registered tool, no gating. */
export function talentDefinitions(): ToolDefinition[] {
  return deriveToolSchemas();
}

export interface TalentFragmentContext {
  now: Date;
  maxToolTurns: number;
}

/** System-prompt fragments for the active talents, folded by the caller
 *  into the ONE leading system message (PocketPal's
 *  collectSystemPromptFragments). Only web_search has one; the read_url
 *  clause appears only when that talent is active too — a fragment naming
 *  a tool the model cannot call is a lie. */
export function collectSystemPromptFragments(
  names: readonly string[],
  ctx: TalentFragmentContext,
): string[] {
  if (!names.includes("web_search")) return [];
  const today = ctx.now.toLocaleDateString("en-CA");
  const canRead = names.includes("read_url");
  const budget = Math.max(ctx.maxToolTurns - 1, 1);
  return [
    `Today's date is ${today}. You can search the web with web_search${
      canRead ? " and open pages with read_url" : ""
    }. For time-sensitive or factual questions, search first; usually one or two searches suffice — you have a budget of ${budget} tool calls. Answer using the facts in the results and cite source URLs. If the results do not contain the answer, say so rather than guessing.`,
  ];
}

// ---------------------------------------------------------------------------
// web_search (PocketParity: talents/WebSearchEngine.ts)
// ---------------------------------------------------------------------------

const PER_SNIPPET_CHARS = 280;

/** Queries dedupe in flight: a model calling web_search twice in one turn
 *  pays provider quota once. */
const inFlight = new Map<string, Promise<SearchHit[]>>();

const formatHit = (hit: SearchHit): string => {
  const date = hit.publishedAt ? ` *(${hit.publishedAt})*` : "";
  const lines = [`- **${hit.title || hit.url}**${date}`];
  if (hit.snippet) {
    lines.push(`  ${hit.snippet}`);
  }
  lines.push(`  <${hit.url}>`);
  return lines.join("\n");
};

const formatMenu = (query: string, hits: SearchHit[]): string => {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  return [
    `## Web search results for "${query}" (retrieved ${retrievedAt})`,
    ...hits.map(formatHit),
  ].join("\n");
};

// ---------------------------------------------------------------------------
// read_url (PocketParity: talents/ReadUrlEngine.ts)
// ---------------------------------------------------------------------------

/** Reject non-http(s) schemes and embedded credentials so a malicious page
 *  can't steer a later read at an exfiltration target or non-web resource. */
const isHttpUrl = (raw: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  return parsed.hostname.length > 0;
};

const MAX_PAGE_LINKS = 100;

/** Execute one talent by name; every outcome is a TalentOutcome, never a
 *  throw. */
export async function runTalent(
  name: string,
  argsJson: string,
  ctx: TalentContext,
): Promise<TalentOutcome> {
  if (
    name !== "datetime" &&
    name !== "calculate" &&
    name !== "web_search" &&
    name !== "read_url" &&
    name !== "render_html"
  ) {
    return fail(`Talent "${name}" is not enabled for this run`);
  }
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(argsJson || "{}");
    args =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return fail(`Error: invalid JSON arguments for ${name}`);
  }

  if (name === "datetime") {
    const timezone = typeof args.timezone === "string" ? args.timezone : undefined;
    return done(localTime(timezone ? { timezone } : {}));
  }
  if (name === "calculate") {
    const expression = typeof args.expression === "string" ? args.expression : undefined;
    return done(calculate(expression ? { expression } : {}));
  }
  if (name === "render_html") {
    // Pure pass-through (PocketParity: RenderHtmlEngine.ts) — the MODEL
    // authors the html, nothing is fetched. `data` carries it to the
    // renderer; the model reads `content` only, so it never gets its own
    // html echoed back (a large echo would crowd the context for no
    // benefit — it can see what it just wrote).
    const html = typeof args.html === "string" ? args.html : "";
    const title = typeof args.title === "string" ? args.title : undefined;
    if (!html) return fail('render_html: missing or empty "html" argument');
    return done(
      "[render_html SUCCESS] The html has been rendered into a preview above, and the user can see and toggle to see the code. \nReply with at most one short sentence what you build",
      title !== undefined ? { html, title } : { html },
    );
  }
  if (name === "web_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return fail('web_search: missing or empty "query" argument');
    }
    if (!ctx.search || ctx.search.key.trim() === "") {
      return fail(`web_search: ${SEARCH_NOT_SET_UP_MESSAGE}`);
    }
    const { provider, key, count } = ctx.search;
    let hits: SearchHit[];
    try {
      const cache = cacheKey(provider, query, count);
      const cached = getCachedHits(provider, query, count);
      const shared = inFlight.get(cache);
      if (cached) {
        hits = cached;
      } else if (shared) {
        hits = await shared;
      } else {
        const request = searchWeb(ctx.fetchImpl, provider, key, query, count);
        inFlight.set(cache, request);
        try {
          hits = await request;
        } finally {
          inFlight.delete(cache);
        }
      }
    } catch (err) {
      return fail(
        `web_search: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Budget by the MODEL-VISIBLE renderer (PocketParity): providers hand
    // over unclipped rows; the ceiling decides how many survive, and hits
    // drop whole.
    const countClamped = count;
    const budgeted = budgetHits(
      hits,
      {
        maxResults: countClamped,
        perSnippetChars: PER_SNIPPET_CHARS,
        tokenCeiling: RECOMMENDED_CONTEXT.web_search ?? 1000,
      },
      formatHit,
    );

    if (budgeted.length === 0) {
      if (__DEV__) {
        console.log("[web_search]", { query, provider, count: 0 });
      }
      // No usable hits — provider returned none, or budgeting rejected
      // them all. Don't cache: a transient/all-rejected empty must not
      // lock out retries or flip the same input between success and
      // error on replay (PocketParity).
      return fail(
        `web_search: no results for "${query}". Try a shorter or less restrictive query.`,
      );
    }

    // Cache the budgeted hits, not the raw payload — same model-visible
    // result on replay, without retaining oversized provider snippets.
    setCachedHits(provider, query, countClamped, budgeted);
    allowReadUrls(budgeted.map((h) => h.url));

    if (__DEV__) {
      console.log("[web_search]", {
        query,
        provider,
        count: budgeted.length,
        results: budgeted.map((h) => ({ title: h.title, url: h.url })),
      });
    }

    // `hits` rides alongside the fenced markdown: one is what the MODEL
    // reads (fenced, because it is untrusted third-party text) and the
    // other is what the USER's renderer draws.
    return done(
      fenceUntrusted(formatMenu(query, budgeted)),
      {
        hits: budgeted.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })),
      },
    );
  }
  // read_url
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!url) {
    return fail('read_url: missing or empty "url" argument');
  }
  if (!isHttpUrl(url)) {
    return fail("read_url: only http(s) URLs are allowed");
  }
  if (!ctx.search) {
    return fail(`read_url: ${SEARCH_NOT_SET_UP_MESSAGE}`);
  }
  // Exfiltration guard: fetch the stored entry, or the canonical request on
  // a site the user named (PocketParity matchReadUrl).
  const targetUrl = matchReadUrl(url);
  if (targetUrl === null) {
    return fail(
      "read_url: this URL is not allowed. Use a page on a site the user named, or copy a URL exactly from a web_search result or a page you read with read_url; or run web_search first.",
    );
  }
  let page;
  try {
    page = await readPage(ctx.fetchImpl, ctx.search.provider, ctx.search.key, targetUrl);
  } catch (err) {
    return fail(
      `read_url: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const bounded = budgetPage(page, RECOMMENDED_CONTEXT.read_url ?? 1200);
  if (__DEV__) {
    console.log("[read_url]", {
      url: targetUrl,
      provider: ctx.search.provider,
      textLength: bounded.text.length,
    });
  }
  if (!bounded.text) {
    return fail(`read_url: no readable content at ${targetUrl}`);
  }

  const links = extractUrls(bounded.text).slice(0, MAX_PAGE_LINKS);
  allowReadUrls(links);

  const header = bounded.title ? `${bounded.title}\n${targetUrl}` : targetUrl;
  return done(
    // `content` is the MODEL's copy, so it stays fenced. `text` is the
    // USER's copy — showing the fence to a reader is prompt-injection
    // boilerplate they never asked for. Same source text, two audiences.
    fenceUntrusted(`${header}\n\n${bounded.text}`),
    { url: targetUrl, text: bounded.text, links },
  );
}
