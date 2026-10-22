/** Provider adapters + transport (429 retry, body caps, shape checks). */

import {
  FETCH_TIMEOUT_MS,
  MAX_BODY_BYTES,
  ProviderError,
  braveSearch,
  exaRead,
  exaSearch,
  firecrawlRead,
  firecrawlSearch,
  parallelSearch,
  providerJson,
  readWithDefaultReader,
  requireKey,
  searchWeb,
  tavilySearch,
  youSearch,
  YOU_FREE_LIMIT_MESSAGE,
  YOU_FREE_URL,
  YOU_KEYED_LIMIT_MESSAGE,
  YOU_KEYED_URL,
  type HttpFetch,
} from "../search";

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function fakeFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
): HttpFetch {
  return ((url: string, init: RequestInit) => impl(url, init)) as HttpFetch;
}

describe("requireKey (PocketParity label copy)", () => {
  it("throws the provider-labeled message on a blank key", () => {
    expect(() => requireKey("  ", "Tavily")).toThrow("Tavily key not set");
    expect(() => requireKey("", "Brave")).toThrow("Brave key not set");
    expect(() => requireKey(" k ", "Exa")).not.toThrow();
  });
});

describe("providerJson transport", () => {
  it("maps HTTP failures to ProviderError with the status", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ error: "x" }, 401));
    await expect(
      providerJson(fetchImpl, "https://t.example", { method: "GET" }),
    ).rejects.toThrow("request failed (401)");
  });

  it("declares the 12s deadline and 2MB body cap constants", () => {
    expect(FETCH_TIMEOUT_MS).toEqual(12_000);
    expect(MAX_BODY_BYTES).toEqual(2 * 1024 * 1024);
  });

  it("retries a 429 once and succeeds (retryOn429)", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse("rate limited", 429);
      return jsonResponse({ ok: true });
    });
    const out = await providerJson(fetchImpl, "https://t.example", { method: "GET" }, { retryOn429: true });
    expect(calls).toEqual(2);
    expect(out).toEqual({ ok: true });
  });

  it("does not retry a 429 when retryOn429 is off", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse("", 429);
    });
    await expect(
      providerJson(fetchImpl, "https://t.example", { method: "GET" }),
    ).rejects.toThrow("request failed (429)");
    expect(calls).toEqual(1);
  });

  it("aborts the upstream fetch when its own deadline fires", async () => {
    const fetchImpl = fakeFetch(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted upstream")),
          );
        }),
    );
    await expect(
      providerJson(fetchImpl, "https://t.example", { method: "GET" }, { timeoutMs: 30 }),
    ).rejects.toThrow("timed out");
  });

  it("rejects an over-cap declared body (content-length)", async () => {
    const fetchImpl = fakeFetch(async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Length": String(MAX_BODY_BYTES + 1) },
      }),
    );
    await expect(
      providerJson(fetchImpl, "https://t.example", { method: "GET" }),
    ).rejects.toThrow("response too large");
  });

  it("rejects an over-cap body that lies about its size", async () => {
    const big = `{"pad":"${"x".repeat(MAX_BODY_BYTES + 1)}"}`;
    const fetchImpl = fakeFetch(async () =>
      new Response(big, { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await expect(
      providerJson(fetchImpl, "https://t.example", { method: "GET" }),
    ).rejects.toThrow("response too large");
  });
});

describe("tavilySearch", () => {
  it("POSTs the key+query and maps title/url/content + published_date", async () => {
    let seen = { url: "", body: "" };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = { url: String(url), body: String(init.body) };
      return jsonResponse({
        results: [
          { title: "T", url: "https://t.example", content: "snippet here", published_date: "2026-02-01" },
          { title: "", url: "", content: "dropped: no url" },
        ],
      });
    });
    const out = await tavilySearch(fetchImpl, "k", "query words", 5);
    expect(seen.url).toEqual("https://api.tavily.com/search");
    const body = JSON.parse(seen.body);
    expect(body.api_key).toEqual("k");
    expect(body.query).toEqual("query words");
    expect(body.search_depth).toEqual("basic");
    expect(out).toEqual([
      {
        title: "T",
        url: "https://t.example",
        snippet: "snippet here",
        publishedAt: "2026-02-01",
      },
    ]);
  });

  it("rejects a missing key with the labeled message, offline", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    await expect(tavilySearch(fetchImpl, "  ", "q", 5)).rejects.toThrow(
      "Tavily key not set",
    );
    expect(calls).toEqual(0);
  });

  it("throws 'unexpected response' when results are missing", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ note: "not a search" }));
    await expect(tavilySearch(fetchImpl, "k", "q", 5)).rejects.toThrow(
      "unexpected response",
    );
  });
});

describe("braveSearch", () => {
  it("GETs with the subscription header and maps web.results + page_age", async () => {
    let seen = { url: "", headers: {} as Record<string, string> };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = {
        url: String(url),
        headers: { ...(init.headers as Record<string, string>) },
      };
      return jsonResponse({
        type: "search",
        web: {
          results: [
            {
              title: "B",
              url: "https://b.example",
              description: "brave snippet",
              page_age: "2026-01-01",
            },
          ],
        },
      });
    });
    const out = await braveSearch(fetchImpl, "bk", "other words", 3);
    expect(seen.url.includes("api.search.brave.com")).toBeTruthy();
    expect(seen.url.includes("q=other%20words")).toBeTruthy();
    expect(seen.headers["X-Subscription-Token"]).toEqual("bk");
    expect(out).toEqual([
      {
        title: "B",
        url: "https://b.example",
        snippet: "brave snippet",
        publishedAt: "2026-01-01",
      },
    ]);
  });

  it("checks the response shape ('unexpected response' on a non-search type)", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ type: "news" }));
    await expect(braveSearch(fetchImpl, "k", "q", 5)).rejects.toThrow(
      "unexpected response",
    );
  });

  it("rejects a missing key with the labeled message, offline", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    await expect(braveSearch(fetchImpl, "", "q", 5)).rejects.toThrow(
      "Brave key not set",
    );
    expect(calls).toEqual(0);
  });
});

describe("exaSearch / exaRead", () => {
  it("POSTs with x-api-key and picks highlights → summary → text", async () => {
    let seen = { url: "", body: "" };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = { url: String(url), body: String(init.body) };
      return jsonResponse({
        results: [
          { title: "E", url: "https://e.example", highlights: ["h1", "h2"], publishedDate: "2026-03-01" },
        ],
      });
    });
    const out = await exaSearch(fetchImpl, "ek", "exa words", 4);
    expect(seen.url).toEqual("https://api.exa.ai/search");
    const body = JSON.parse(seen.body);
    expect(body.numResults).toEqual(4);
    expect(body.contents).toEqual({ highlights: true, summary: true });
    expect(out).toEqual([
      {
        title: "E",
        url: "https://e.example",
        snippet: "h1 h2",
        publishedAt: "2026-03-01",
      },
    ]);
    const fetcher2 = fakeFetch(async () =>
      jsonResponse({
        results: [{ title: "2", url: "https://2.example", summary: "s" }],
      }),
    );
    expect(await exaSearch(fetcher2, "k", "q", 4)).toEqual([
      { title: "2", url: "https://2.example", snippet: "s", publishedAt: undefined },
    ]);
  });

  it("reads a page through POST /contents", async () => {
    let seen = { url: "", body: "" };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = { url: String(url), body: String(init.body) };
      return jsonResponse({
        results: [{ title: "Page", text: "body text" }],
      });
    });
    const out = await exaRead(fetchImpl, "ek", "https://e.example/a");
    expect(seen.url).toEqual("https://api.exa.ai/contents");
    expect(JSON.parse(seen.body)).toEqual({
      urls: ["https://e.example/a"],
      text: true,
    });
    expect(out).toEqual({ url: "https://e.example/a", title: "Page", text: "body text" });
  });

  it("rejects a missing key with the labeled message", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ results: [] }));
    await expect(exaSearch(fetchImpl, "", "q", 4)).rejects.toThrow("Exa key not set");
  });
});

describe("firecrawlSearch / firecrawlRead", () => {
  it("POSTs v2 /search with the auth bearer and maps data.web", async () => {
    let seen = { url: "", headers: {} as Record<string, string>, body: "" };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = {
        url: String(url),
        headers: { ...(init.headers as Record<string, string>) },
        body: String(init.body),
      };
      return jsonResponse({
        success: true,
        data: {
          web: [{ title: "F", url: "https://f.example", description: "fc" }],
        },
      });
    });
    const out = await firecrawlSearch(fetchImpl, "fk", "fire words", 2);
    expect(seen.url).toEqual("https://api.firecrawl.dev/v2/search");
    expect(seen.headers.Authorization).toEqual("Bearer fk");
    const body = JSON.parse(seen.body);
    expect(body.limit).toEqual(2);
    expect(body.origin).toEqual("liai");
    expect(out).toEqual([{ title: "F", url: "https://f.example", snippet: "fc" }]);
  });

  it("throws when success is not true", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ success: false }));
    await expect(firecrawlSearch(fetchImpl, "k", "q", 2)).rejects.toThrow(
      "unexpected response",
    );
  });

  it("scrapes a page and maps markdown + metadata.title", async () => {
    const fetchImpl = fakeFetch(async () =>
      jsonResponse({
        success: true,
        data: {
          markdown: "# page",
          metadata: { title: "T", statusCode: 200 },
        },
      }),
    );
    const out = await firecrawlRead(fetchImpl, "k", "https://f.example");
    expect(out).toEqual({ url: "https://f.example", title: "T", text: "# page" });
  });

  it("surfaces a failed page status from scrape metadata", async () => {
    const fetchImpl = fakeFetch(async () =>
      jsonResponse({
        success: true,
        data: { markdown: "x", metadata: { statusCode: 404 } },
      }),
    );
    await expect(firecrawlRead(fetchImpl, "k", "https://f.example")).rejects.toThrow(
      "page returned 404",
    );
  });
});

describe("youSearch (keyless free tier + keyed)", () => {
  it("hits the FREE url without a key, no X-API-Key header", async () => {
    let seen = { url: "", headers: {} as Record<string, string> };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = {
        url: String(url),
        headers: { ...(init.headers as Record<string, string>) },
      };
      return jsonResponse({
        results: {
          web: [{ title: "Y", url: "https://y.example", snippets: ["a", "b"], page_age: "2026-04-01" }],
        },
      });
    });
    const out = await youSearch(fetchImpl, "", "you words", 5);
    expect(seen.url.startsWith(YOU_FREE_URL) || seen.url.startsWith(
      "https://api.you.com/v1/agents/search",
    )).toBeTruthy();
    expect(seen.headers["X-API-Key"]).toBeUndefined();
    expect(seen.headers["User-Agent"]).toContain("youdotcom-integration/a-ghorbani-pocketpal-ai");
    expect(out).toEqual([
      {
        title: "Y",
        url: "https://y.example",
        snippet: "a",
        publishedAt: "2026-04-01",
      },
    ]);
  });

  it("hits the KEYED url with the X-API-Key header when a key exists", async () => {
    let seen = { url: "" };
    const fetchImpl = fakeFetch(async (url) => {
      seen = { url: String(url) };
      return jsonResponse({ results: { web: [{ title: "K", url: "https://k.example", description: "d" }] } });
    });
    const out = await youSearch(fetchImpl, "yk", "q", 5);
    expect(seen.url.startsWith(YOU_KEYED_URL) || seen.url.startsWith("https://ydc-index.io/v1/search")).toBeTruthy();
    expect(out).toEqual([{ title: "K", url: "https://k.example", snippet: "d" }]);
  });

  it("translates a 429 into the tier's limit message", async () => {
    const free = fakeFetch(async () => jsonResponse("", 429));
    await expect(youSearch(free, "", "q", 5)).rejects.toThrow(YOU_FREE_LIMIT_MESSAGE);
    let sawKeyedCalls = 0;
    const keyed = fakeFetch(async () => {
      sawKeyedCalls += 1;
      return jsonResponse("", 429);
    });
    await expect(youSearch(keyed, "yk", "q", 5)).rejects.toThrow(YOU_KEYED_LIMIT_MESSAGE);
    // PocketParity: the transport itself retries a 429 once (wait ≤2s)
    // BEFORE the provider maps the still-429 failure into the limit copy.
    expect(sawKeyedCalls).toEqual(2);
  });

  it("throws 'unexpected response' when web rows are absent", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ results: {} }));
    await expect(youSearch(fetchImpl, "", "q", 5)).rejects.toThrow("unexpected response");
  });
});

describe("parallelSearch", () => {
  it("POSTs objective/max_results and joins excerpts", async () => {
    let seen = { url: "", body: "" };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = { url: String(url), body: String(init.body) };
      return jsonResponse({
        results: [
          {
            title: "P",
            url: "https://p.example",
            excerpts: ["one", "two"],
            published_date: "2026-05-01",
          },
        ],
      });
    });
    const out = await parallelSearch(fetchImpl, "pk", "par words", 3);
    expect(seen.url).toEqual("https://api.parallel.ai/v1/search");
    const body = JSON.parse(seen.body);
    expect(body.objective).toEqual("par words");
    expect(body.max_results).toEqual(3);
    expect(out).toEqual([
      {
        title: "P",
        url: "https://p.example",
        snippet: "one two",
        publishedAt: "2026-05-01",
      },
    ]);
  });

  it("rejects a missing key with the labeled message", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ results: [] }));
    await expect(parallelSearch(fetchImpl, "", "q", 3)).rejects.toThrow(
      "Parallel key not set",
    );
  });
});

describe("searchWeb dispatch", () => {
  it("rejects unknown providers", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({}));
    await expect(searchWeb(fetchImpl, "gopher", "k", "q", 5)).rejects.toThrow(
      /unknown search provider/,
    );
  });

  it("returns [] on blank queries without fetching", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    expect(await searchWeb(fetchImpl, "tavily", "k", "   ", 5)).toEqual([]);
    expect(calls).toEqual(0);
  });

  it("clamps the count into the provider-legal band", async () => {
    let body = "";
    const fetchImpl = fakeFetch(async (_url, init) => {
      body = String(init.body);
      return jsonResponse({
        results: [{ title: "T", url: "https://t.example", content: "s" }],
      });
    });
    await searchWeb(fetchImpl, "tavily", "k", "q", 99);
    expect(JSON.parse(body).max_results).toEqual(10); // MAX_COUNT
  });

  it("passes rows through WITHOUT clipping — budgeting is the talent's job", async () => {
    const fetchImpl = fakeFetch(async () =>
      jsonResponse({
        results: [
          { title: "T", url: "https://t.example", content: "x".repeat(5000) },
        ],
      }),
    );
    const out = await searchWeb(fetchImpl, "tavily", "k", "q", 5);
    expect(out[0].snippet.length).toEqual(5000);
  });
});

describe("default reader", () => {
  it("fetches r.jina.ai plain text for the page", async () => {
    let seen = "";
    const fetchImpl = fakeFetch(async (url) => {
      seen = String(url);
      return new Response("<p>hello page</p>", { status: 200 });
    });
    const out = await readWithDefaultReader(fetchImpl, "https://a.example/x");
    expect(seen).toEqual("https://r.jina.ai/https://a.example/x");
    expect(out.url).toEqual("https://a.example/x");
    expect(out.text).toContain("hello page");
  });

  it("maps failures to ProviderError", async () => {
    const fetchImpl = fakeFetch(async () => new Response("no", { status: 500 }));
    await expect(
      readWithDefaultReader(fetchImpl, "https://a.example"),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
