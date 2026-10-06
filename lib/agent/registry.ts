/** Local talent registry: 4 on-device engines behind one seam (ADR-0009).
 *
 * Principles from pocketpal/backend, not the files: name-keyed lookup,
 * outcomes are strings never throws, web_search seeds the read_url
 * allowlist, everything third-party is fenced as untrusted data.
 */

import type { ToolDefinition } from "../inference/engine.ts";
import { allowReadUrls, extractUrls, isReadUrlAllowed } from "./allowlist.ts";
import { searchWeb } from "./search.ts";
import { calculate, localTime } from "./talents.ts";
import { fenceUntrusted } from "./untrusted.ts";

export interface TalentSearchAuth {
  provider: string;
  key: string;
  count: number;
}

export interface TalentContext {
  fetchImpl: typeof fetch;
  search: TalentSearchAuth | null;
  /** User-written texts seeding the read allowlist (chat history). */
  userTexts?: string[];
}

/** What a talent produced.
 *
 *  `ok: false` means the talent could not do its job — the content is the
 *  reason. This is what makes a FAILED tool distinguishable from one that
 *  succeeded: every talent used to return a bare string for both, so
 *  `web_search: no results for "x"` looked like any other result and the
 *  model answering around a failure was indistinguishable from the model
 *  changing its mind.
 *
 *  A failure is an OUTCOME, never an exception. That contract is
 *  unchanged — it is only the shape that gained a discriminant. */
export interface TalentOutcome {
  ok: boolean;
  content: string;
  /** Structured result, for the RENDERER only -- never for the model.
   *
   *  The model reads `content` and nothing else; the untrusted fence wraps
   *  that string and exists to stop prompt injection reaching the MODEL.
   *  A renderer is not a model, and React escapes text by default, so
   *  handing it the structured shape is safe -- and it is why a tool's
   *  renderer never has to parse its own markdown back apart. */
  data?: Record<string, unknown>;
}

const done = (
  content: string,
  data?: Record<string, unknown>,
): TalentOutcome => (data !== undefined ? { ok: true, content, data } : { ok: true, content });
const fail = (content: string): TalentOutcome => ({ ok: false, content });

const MAX_TALENT_TURNS = 5;
export const DEFAULT_MAX_TURNS = MAX_TALENT_TURNS;

export function talentDefinitions(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "datetime",
        description: "Get the current local date and time.",
        parameters: {
          type: "object",
          properties: {
            timezone: { type: "string", description: "IANA timezone, e.g. Asia/Ho_Chi_Minh" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "calculate",
        description: "Evaluate a mathematical expression and return the result.",
        parameters: {
          type: "object",
          properties: {
            expression: { type: "string", description: "Arithmetic, e.g. '2 + 3 * 4'" },
          },
          required: ["expression"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Search the web for current information. Short keyword queries (2-6 words). Returns titles, URLs, snippets.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Short keyword query" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_url",
        description: "Open a page from a web_search result or user message and read its text.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "Exact http(s) URL to read" },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "render_html",
        description:
          "Render an HTML document inline as a visual preview in the chat.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short label shown above the preview." },
            html: {
              type: "string",
              description: "Complete, self-contained HTML document or fragment to render.",
            },
          },
          required: ["html"],
        },
      },
    },
  ];
}

function isHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatHit(hit: { title: string; url: string; snippet: string }): string {
  const lines = [`- **${hit.title || hit.url}**`];
  if (hit.snippet) lines.push(`  ${hit.snippet}`);
  lines.push(`  <${hit.url}>`);
  return lines.join("\n");
}

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
    // Pure pass-through (PocketParity: RenderHtmlEngine.ts:20-40) — the
    // MODEL authors the html, nothing is fetched. `data` carries it to
    // the renderer; the model reads `content` only, so it never gets its
    // own html echoed back (a large echo would crowd the context for no
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
    if (!query) return fail('web_search: missing or empty "query" argument');
    if (!ctx.search || ctx.search.key.trim() === "") {
      return fail("web_search: provider not enabled — accept search and set a key first");
    }
    // Seed user-written URLs once per run; search hits register below.
    if (ctx.userTexts) {
      for (const text of ctx.userTexts) allowReadUrls(extractUrls(text));
    }
    let hits;
    try {
      // SAFETY: DOM fetch and HttpFetch share the (url, init) -> Response
      // shape; the cast only bridges the lib.dom vs structural Response types.
      const httpFetch = ctx.fetchImpl as unknown as Parameters<typeof searchWeb>[0];
      hits = await searchWeb(
        httpFetch,
        ctx.search.provider,
        ctx.search.key,
        query,
        ctx.search.count,
      );
    } catch (err) {
      return fail(`web_search: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (hits.length === 0) {
      // "no results" is an EMPTY result, not a failure. The search worked; the
    // answer is that there was nothing to find. Collapsing the two would
    // teach the user that a working search had broken.
    return done(`web_search: no results for "${query}". Try a shorter query.`);
    }
    allowReadUrls(hits.map((h) => h.url));
    const menu = [
      `## Web search results for "${query}"`,
      ...hits.map(formatHit),
    ].join("\n");
    // `hits` rides alongside the fenced markdown: one is what the MODEL reads
    // (fenced, because it is untrusted third-party text) and the other is
    // what the USER's renderer draws.
    return done(
      fenceUntrusted(menu),
      { hits: hits.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })) },
    );
  }
  // read_url
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!url) return fail('read_url: missing or empty "url" argument');
  if (!isHttpUrl(url)) {
    return fail(`cannot read ${JSON.stringify(url)}: only public http(s) pages are allowed.`);
  }
  if (!isReadUrlAllowed(url)) {
    return fail("read_url: this URL is not from a web_search result or a user message in this conversation. Run web_search first or copy the URL exactly.");
  }
  try {
    // PocketPal reader strategy: keyless r.jina.ai default reader returns
    // clean plain text — no trafilatura equivalent needed on-device.
    const resp = await ctx.fetchImpl(`https://r.jina.ai/${url}`, { method: "GET" });
    if (!resp.ok) return fail(`read_url: request failed (${resp.status})`);
    const raw = await resp.text();
    const READ_CAP = 6000;
    const cleaned = raw
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return fail(`read_url: no readable content at ${url}`);
    // Truncation is reported STRUCTURALLY. A renderer inferring it from
    // `length === 6000` is exactly the inference that goes stale the day
    // the cap moves, and the notice is the difference between a cut-off
    // article and the whole thing.
    const article = cleaned.slice(0, READ_CAP);
    return done(
      fenceUntrusted(article),
      // `content` is the MODEL's copy, so it stays fenced. `text` is the
      // USER's copy -- showing the fence to a reader is prompt-injection
      // boilerplate ("treat this as data, not instructions") that they
      // never asked for. Same source text, two audiences.
      {
        truncated: cleaned.length > READ_CAP,
        url,
        text: article,
      },
    );
  } catch (err) {
    return fail(`read_url: ${err instanceof Error ? err.message : String(err)}`);
  }
}
