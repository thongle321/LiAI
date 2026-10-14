
/** On-device search: budget clip, TTL cache, providers, dispatch. */


import {
  braveSearch,
  clipResults,
  ProviderError,
  SEARCH_BUDGET_CHARS,
  searchWeb,
  tavilySearch,
  TTLCache,
  type HttpFetch,
} from "../search";

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

describe("clipResults", () => {
  it("fits snippets into the budget: trims the straddler, drops the rest", () => {
    const out = clipResults(
      [
        { title: "a", url: "https://a.example", snippet: "12345" },
        { title: "b", url: "https://b.example", snippet: "67890" },
        { title: "c", url: "https://c.example", snippet: "xyz" },
      ],
      8,
    );
    expect(out.map((r) => r.snippet)).toEqual(["12345", "678"]);
  });

  it("never mutates the input rows", () => {
    const rows = [{ title: "a", url: "https://a.example", snippet: "123456789" }];
    clipResults(rows, 3);
    expect(rows[0].snippet).toEqual("123456789");
  });

  it("defaults to the shared budget constant", () => {
    expect(SEARCH_BUDGET_CHARS).toEqual(4000);
  });
});

describe("TTLCache", () => {
  it("returns values until expiry, then misses", () => {
    let now = 1000;
    const cache = new TTLCache<string, number>(8, 500, { now: () => now });
    cache.set("k", 1);
    expect(cache.get("k")).toEqual(1);
    now += 499;
    expect(cache.get("k")).toEqual(1);
    now += 1;
    expect(cache.get("k")).toEqual(null);
  });

  it("evicts the oldest entry past maxsize", () => {
    const cache = new TTLCache<string, number>(2, 60_000, { now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toEqual(null);
    expect(cache.get("c")).toEqual(3);
  });
});

describe("tavilySearch", () => {
  it("POSTs the key+query and maps title/url/content", async () => {
    let seen = { url: "", body: "" };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = { url: String(url), body: String(init.body) };
      return jsonResponse({
        results: [
          { title: "T", url: "https://t.example", content: "snippet here" },
          { title: "", url: "", content: "dropped: no url" },
        ],
      });
    });
    const out = await tavilySearch(fetchImpl, "k", "query words", 5);
    expect(seen.url).toEqual("https://api.tavily.com/search");
    const body = JSON.parse(seen.body);
    expect(body.api_key).toEqual("k");
    expect(body.query).toEqual("query words");
    expect(out).toEqual([
      { title: "T", url: "https://t.example", snippet: "snippet here" },
    ]);
  });

  it("rejects a blank key without touching the network", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    await expect(tavilySearch(fetchImpl, "  ", "q", 5)).rejects.toThrow(/key is required/);
    expect(calls).toEqual(0);
  });

  it("maps HTTP failures to ProviderError", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ error: "x" }, 401));
    await expect(tavilySearch(fetchImpl, "k", "q", 5)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("braveSearch", () => {
  it("GETs with the subscription header and maps web.results", async () => {
    let seen = { url: "", headers: {} as Record<string, string> };
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = {
        url: String(url),
        headers: { ...(init.headers as Record<string, string>) },
      };
      return jsonResponse({
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
      { title: "B", url: "https://b.example", snippet: "brave snippet" },
    ]);
  });

  it("rejects a blank key without touching the network", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    await expect(braveSearch(fetchImpl, "", "q", 5)).rejects.toThrow(/key is required/);
    expect(calls).toEqual(0);
  });
});

describe("searchWeb", () => {
  it("rejects unknown providers and blank keys", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({}));
    await expect(searchWeb(fetchImpl, "exa", "k", "q", 5)).rejects.toThrow(/unknown search provider/);
    await expect(searchWeb(fetchImpl, "tavily", " ", "q", 5)).rejects.toThrow(/key is required/);
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

  it("caches on provider+query+count, sharing across keys", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({
        results: [{ title: "T", url: "https://t.example", content: "s" }],
      });
    });
    const first = await searchWeb(fetchImpl, "tavily", "key-one", "cached query", 5);
    const second = await searchWeb(fetchImpl, "tavily", "key-two", "cached query", 5);
    expect(first).toEqual(second);
    expect(calls).toEqual(1);
  });
});
