/** web_search talent parity (PocketPal WebSearchEngine.ts): budget by the
 *  model-visible renderer, cache budgeted hits, error on empty, seed the
 *  read allowlist, and the exact not-set-up copy. */

import {
  isReadUrlAllowed,
  resetReadUrlAllowlist,
} from "../allowlist.ts";
import {
  deriveToolSchemas,
  runTalent,
  SEARCH_NOT_SET_UP_MESSAGE,
} from "../registry.ts";
import { getCachedHits, resetSearchCache } from "../search-budget.ts";
import type { HttpFetch } from "../search.ts";
import { flushTick, hangingFetch as hangingTransport } from "@/jest/fixtures/search-transport.ts";

const AUTH = { provider: "brave", key: "bk", count: 5 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
): HttpFetch {
  return ((url: string, init: RequestInit) => impl(url, init)) as HttpFetch;
}

function braved(hits: unknown[]): Response {
  return jsonResponse({
    type: "search",
    web: { results: hits },
  });
}

const search = (fetchImpl: HttpFetch, query: string, auth = AUTH) =>
  runTalent("web_search", JSON.stringify({ query }), { fetchImpl, search: auth });

/** The same call with the turn's Stop attached. */
const searchOn = (fetchImpl: HttpFetch, query: string, signal: AbortSignal) =>
  runTalent("web_search", JSON.stringify({ query }), { fetchImpl, search: AUTH, signal });

beforeEach(() => {
  resetSearchCache();
  resetReadUrlAllowlist();
});

describe("web_search happy path", () => {
  it("returns the fenced menu to the model and hits to the renderer", async () => {
    const fetchImpl = fakeFetch(async () =>
      braved([
        {
          title: "Nobel physics 2026",
          url: "https://news.example/nobel",
          description: "...",
          page_age: "2026-06-01",
        },
      ]),
    );
    const out = await search(fetchImpl, "nobel prize physics 2026");
    expect(out.ok).toBe(true);
    // MODEL copy: fenced, menu-shaped, retrieved date, publishedAt.
    expect(out.content).toContain("BEGIN UNTRUSTED WEB CONTENT");
    expect(out.content).toContain('## Web search results for "nobel prize physics 2026" (retrieved');
    expect(out.content).toContain("**Nobel physics 2026** *(2026-06-01)*");
    expect(out.content).toContain("<https://news.example/nobel>");
    // RENDERER copy: structured, unfenced.
    expect(out.data?.hits).toEqual([
      { title: "Nobel physics 2026", url: "https://news.example/nobel", snippet: "..." },
    ]);
  });

  it("seeds the read allowlist with the hit URLs", async () => {
    const fetchImpl = fakeFetch(async () =>
      braved([{ title: "x", url: "https://hit.example/a", description: "d" }]),
    );
    await search(fetchImpl, "some query");
    expect(isReadUrlAllowed("https://hit.example/a")).toBe(true);
    // The URL as the model transcribed it still matches post-canonicalization.
    expect(isReadUrlAllowed(" https://HIT.example/a#frag ")).toBe(true);
    // An unseeded URL does not.
    expect(isReadUrlAllowed("https://elsewhere.example/page")).toBe(false);
  });

  it("caches the BUDGETED hits on provider+count+query", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return braved([{ title: "x", url: "https://hit.example/a?long" + "u".repeat(1000), description: "d" }]);
    });
    await search(fetchImpl, "cached query");
    const cached = getCachedHits("brave", "cached query", 5);
    expect(cached?.length).toEqual(1);
    // Replay never fetches again.
    await search(fetchImpl, "cached query");
    expect(calls).toEqual(1);
  });

  it("dedupes a batch of identical queries into one provider call", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return braved([{ title: "x", url: "https://hit.example/@i", description: "d" }]);
    });
    const [a, b] = await Promise.all([
      search(fetchImpl, "shared query"),
      search(fetchImpl, "shared query"),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(calls).toEqual(1);
  });
});

describe("web_search failures are outcomes, not throws", () => {
  it("fails a missing/empty query argument", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({}));
    const out = await runTalent("web_search", "{}", { fetchImpl, search: AUTH });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('missing or empty "query"');
  });

  it("fails with the PocketParity setup copy when consent/key is absent", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({}));
    const out = await runTalent("web_search", JSON.stringify({ query: "q" }), {
      fetchImpl,
      search: null,
    });
    expect(out.ok).toBe(false);
    expect(out.content).toEqual(`web_search: ${SEARCH_NOT_SET_UP_MESSAGE}`);
    const outKey = await runTalent("web_search", JSON.stringify({ query: "q" }), {
      fetchImpl,
      search: { provider: "brave", key: "  ", count: 5 },
    });
    expect(outKey.ok).toBe(false);
    expect(outKey.content).toEqual(`web_search: ${SEARCH_NOT_SET_UP_MESSAGE}`);
  });

  it("empty results are a FAILED outcome with the reference copy — never cached", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return braved([]);
    });
    const out = await search(fetchImpl, "empty query");
    expect(out.ok).toBe(false);
    expect(out.content).toEqual(
      'web_search: no results for "empty query". Try a shorter or less restrictive query.',
    );
    expect(getCachedHits("brave", "empty query", 5)).toBeUndefined();
    // Retries still reach the provider.
    await search(fetchImpl, "empty query");
    expect(calls).toEqual(2);
  });

  it("surfaces provider errors as the outcome content", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse("", 500));
    const out = await search(fetchImpl, "q");
    expect(out.ok).toBe(false);
    expect(out.content).toContain("web_search: request failed (500)");
  });

  it("does not seed the allowlist when nothing was returned", async () => {
    const fetchImpl = fakeFetch(async () => braved([]));
    await search(fetchImpl, "q");
    expect(isReadUrlAllowed("https://anywhere.example")).toBe(false);
  });
});

describe("web_search cancellation (PocketPal #999)", () => {
  const tick = flushTick;

  it("a stopped search is a failed outcome, never a throw", async () => {
    const controller = new AbortController();
    const pending = searchOn(hangingTransport().fetchImpl, "stopped query", controller.signal);
    await tick();
    controller.abort();

    const out = await pending;
    expect(out.ok).toBe(false);
    expect(out.content).toEqual("web_search: cancelled");
  });

  it("caches and allows nothing, and leaves no dead in-flight entry", async () => {
    const controller = new AbortController();
    const pending = searchOn(hangingTransport().fetchImpl, "stopped query", controller.signal);
    await tick();
    controller.abort();
    await pending;

    expect(getCachedHits("brave", "stopped query", 5)).toBeUndefined();
    expect(isReadUrlAllowed("https://hit.example/a")).toBe(false);

    // The next identical search must reach the provider itself: a cached
    // entry (or a shared promise the abort killed) would answer instead.
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return braved([{ title: "x", url: "https://hit.example/a", description: "d" }]);
    });
    const retried = await search(fetchImpl, "stopped query");
    expect(retried.ok).toBe(true);
    expect(calls).toBe(1);
    expect(isReadUrlAllowed("https://hit.example/a")).toBe(true);
  });

  it("still shares one request between identical concurrent queries", async () => {
    const controller = new AbortController();
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return braved([{ title: "x", url: "https://hit.example/b", description: "d" }]);
    });
    const [a, b] = await Promise.all([
      searchOn(fetchImpl, "shared query", controller.signal),
      searchOn(fetchImpl, "shared query", controller.signal),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(calls).toBe(1);
  });
});

describe("tool schema (PocketParity wording)", () => {
  it("advertises usage guidance in the description", () => {
    // Via the derived schemas, exactly as the model sees it.
    const web = deriveToolSchemas().find((t) => t.function.name === "web_search");
    expect(web?.function.description).toContain(
      "Write short keyword queries (2-6 words)",
    );
    expect(web?.function.description).toContain(
      "changed since your training data",
    );
  });
});
