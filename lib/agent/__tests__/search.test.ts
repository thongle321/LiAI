const assert: any = {
  ok: (v: unknown, msg?: string) => expect(v).toBeTruthy(),
  equal: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  strictEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toBe(b),
  notEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  notDeepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  match: (value: string, re: RegExp | string, msg?: string) => expect(value).toMatch(re as any),
  doesNotMatch: (value: string, re: RegExp | string, msg?: string) => expect(value).not.toMatch(re as any),
  throws: (fn: () => void, re?: RegExp | string, msg?: string) => expect(fn).toThrow(re as any),
  doesNotThrow: (fn: () => void, msg?: string) => expect(fn).not.toThrow(),
  rejects: async (input: any, expected?: any, msg?: string) => {
    const p = typeof input === "function" ? input() : input;
    let err: unknown;
    try {
      await p;
    } catch (e) {
      err = e;
    }
    if (err === undefined) {
      throw new Error("Expected promise to reject, but it resolved");
    }
    if (expected === undefined) return;
    if (typeof expected === "function") {
      if (expected.prototype) {
        if (!(err instanceof expected)) {
          throw new Error(msg ?? "rejected value not instance of expected constructor");
        }
      } else if (!expected(err)) {
        throw new Error(msg ?? "rejected value did not satisfy validator");
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String((err as Error)?.message ?? err))) {
        throw new Error(msg ?? "rejected message did not match");
      }
    } else if (typeof expected === "string") {
      if (!String((err as Error)?.message ?? err).includes(expected)) {
        throw new Error(msg ?? "rejected message did not include expected text");
      }
    } else if (expected instanceof Error) {
      if (((err as Error)?.message ?? String(err)) !== expected.message) {
        throw new Error(msg ?? "rejected message did not match");
      }
    }
  },
};

/** On-device search: budget clip, TTL cache, providers, dispatch (TDD).
 * Run: node --test frontend/tests/local-search.test.ts */


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
    assert.deepEqual(
      out.map((r) => r.snippet),
      ["12345", "678"],
    );
  });

  it("never mutates the input rows", () => {
    const rows = [{ title: "a", url: "https://a.example", snippet: "123456789" }];
    clipResults(rows, 3);
    assert.equal(rows[0].snippet, "123456789");
  });

  it("defaults to the shared budget constant", () => {
    assert.equal(SEARCH_BUDGET_CHARS, 4000);
  });
});

describe("TTLCache", () => {
  it("returns values until expiry, then misses", () => {
    let now = 1000;
    const cache = new TTLCache<string, number>(8, 500, { now: () => now });
    cache.set("k", 1);
    assert.equal(cache.get("k"), 1);
    now += 499;
    assert.equal(cache.get("k"), 1);
    now += 1;
    assert.equal(cache.get("k"), null);
  });

  it("evicts the oldest entry past maxsize", () => {
    const cache = new TTLCache<string, number>(2, 60_000, { now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    assert.equal(cache.get("a"), null);
    assert.equal(cache.get("c"), 3);
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
    assert.equal(seen.url, "https://api.tavily.com/search");
    const body = JSON.parse(seen.body);
    assert.equal(body.api_key, "k");
    assert.equal(body.query, "query words");
    assert.deepEqual(out, [
      { title: "T", url: "https://t.example", snippet: "snippet here" },
    ]);
  });

  it("rejects a blank key without touching the network", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    await assert.rejects(tavilySearch(fetchImpl, "  ", "q", 5), /key is required/);
    assert.equal(calls, 0);
  });

  it("maps HTTP failures to ProviderError", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({ error: "x" }, 401));
    await assert.rejects(
      tavilySearch(fetchImpl, "k", "q", 5),
      (err: unknown) => err instanceof ProviderError,
    );
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
    assert.ok(seen.url.includes("api.search.brave.com"));
    assert.ok(seen.url.includes("q=other%20words"));
    assert.equal(seen.headers["X-Subscription-Token"], "bk");
    assert.deepEqual(out, [
      { title: "B", url: "https://b.example", snippet: "brave snippet" },
    ]);
  });

  it("rejects a blank key without touching the network", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    await assert.rejects(braveSearch(fetchImpl, "", "q", 5), /key is required/);
    assert.equal(calls, 0);
  });
});

describe("searchWeb", () => {
  it("rejects unknown providers and blank keys", async () => {
    const fetchImpl = fakeFetch(async () => jsonResponse({}));
    await assert.rejects(
      searchWeb(fetchImpl, "exa", "k", "q", 5),
      /unknown search provider/,
    );
    await assert.rejects(
      searchWeb(fetchImpl, "tavily", " ", "q", 5),
      /key is required/,
    );
  });

  it("returns [] on blank queries without fetching", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return jsonResponse({});
    });
    assert.deepEqual(await searchWeb(fetchImpl, "tavily", "k", "   ", 5), []);
    assert.equal(calls, 0);
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
    assert.deepEqual(first, second);
    assert.equal(calls, 1);
  });
});
