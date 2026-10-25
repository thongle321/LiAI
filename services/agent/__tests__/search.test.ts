/** Provider adapters + transport (429 retry, body caps, shape checks). */

import {
  FETCH_TIMEOUT_MS,
  MAX_BODY_BYTES,
  ProviderError,
  braveSearch,
  exaRead,
  exaSearch,
  fetchText,
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

describe("429 retry (PocketPal #999 matrix)", () => {
  const url = "https://t.example/s";
  const response = (status: number, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify({ ok: true }), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  /** One queued response per call; the mock records every call. */
  function fetchReturning(...responses: Response[]) {
    const mock = jest.fn<Promise<Response>, [string, RequestInit]>();
    responses.forEach((r) => mock.mockResolvedValueOnce(r));
    const fetchImpl: HttpFetch = (u, init) => mock(u, init);
    return { fetchImpl, mock };
  }
  const outcome = (call: Promise<unknown>) =>
    call.then(
      () => "resolved",
      (e: Error) => e.message,
    );
  const searchRequest = (fetchImpl: HttpFetch, signal?: AbortSignal) =>
    providerJson(
      fetchImpl,
      url,
      { method: "GET", ...(signal ? { signal } : {}) },
      { retryOn429: true },
    );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is off by default", async () => {
    const { fetchImpl, mock } = fetchReturning(response(429), response(200));

    const result = outcome(providerJson(fetchImpl, url, { method: "GET" }));
    await jest.advanceTimersByTimeAsync(5000);

    expect(await result).toBe("request failed (429)");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries once after Retry-After and leaves no listener or timer behind", async () => {
    const { fetchImpl, mock } = fetchReturning(
      response(429, { "retry-after": "1" }),
      response(200),
    );
    const caller = new AbortController();
    const add = jest.spyOn(caller.signal, "addEventListener");
    const remove = jest.spyOn(caller.signal, "removeEventListener");

    const result = searchRequest(fetchImpl, caller.signal);
    await jest.advanceTimersByTimeAsync(999);
    expect(mock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(mock).toHaveBeenCalledTimes(2);

    expect(await result).toEqual({ ok: true });
    // Two attempts + the wait: each add has exactly one matching remove.
    expect(add).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
    add.mock.calls.forEach(([type, handler], i) => {
      expect(remove.mock.calls[i]).toEqual([type, handler]);
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("returns the original error when the retry also gets 429", async () => {
    const { fetchImpl, mock } = fetchReturning(response(429), response(429));

    const result = outcome(searchRequest(fetchImpl));
    await jest.advanceTimersByTimeAsync(999);
    expect(mock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    expect(await result).toBe("request failed (429)");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("cancels the wait on abort and never sends the retry", async () => {
    const { fetchImpl, mock } = fetchReturning(
      response(429, { "x-ratelimit-reset": "1" }),
      response(200),
    );
    const caller = new AbortController();

    const result = outcome(searchRequest(fetchImpl, caller.signal));
    await jest.advanceTimersByTimeAsync(500);
    caller.abort();
    expect(jest.getTimerCount()).toBe(0);

    expect(await result).toBe("cancelled");
    await jest.advanceTimersByTimeAsync(5000);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Retry-After: 30", { "retry-after": "30" }],
    ["X-RateLimit-Reset: 5", { "x-ratelimit-reset": "5" }],
    ["an epoch-style reset", { "x-ratelimit-reset": "1767225600" }],
  ])("fails at once without a retry when the hint is over 2 s (%s)", async (_label, headers) => {
    const { fetchImpl, mock } = fetchReturning(response(429, headers), response(200));

    expect(await outcome(searchRequest(fetchImpl))).toBe("request failed (429)");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "an HTTP-date 1 s ahead",
      { "retry-after": "Thu, 01 Jan 2026 00:00:01 GMT" },
      1000,
    ],
    ["a past HTTP-date", { "retry-after": "Wed, 31 Dec 2025 23:59:00 GMT" }, 1000],
    ["an unparseable Retry-After", { "retry-after": "soon" }, 1000],
    ["a negative reset", { "x-ratelimit-reset": "-1" }, 1000],
    ["Retry-After over a reset header", { "retry-after": "2", "x-ratelimit-reset": "1" }, 2000],
    [
      "X-RateLimit-Reset over RateLimit-Reset",
      { "x-ratelimit-reset": "1", "ratelimit-reset": "5" },
      1000,
    ],
    ["RateLimit-Reset alone", { "ratelimit-reset": "2" }, 2000],
    ["the smallest value of a reset list", { "x-ratelimit-reset": "1, 1419704" }, 1000],
    ["a reset list whose smaller value comes second", { "x-ratelimit-reset": "5, 1" }, 1000],
  ])("retries after the hinted wait for %s", async (_label, headers, waitMs) => {
    const { fetchImpl, mock } = fetchReturning(response(429, headers), response(200));

    const result = outcome(searchRequest(fetchImpl));
    await jest.advanceTimersByTimeAsync((waitMs as number) - 1);
    expect(mock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    expect(mock).toHaveBeenCalledTimes(2);
    expect(await result).toBe("resolved");
  });

  it.each([500, 503])("does not retry a %i", async (status) => {
    const { fetchImpl, mock } = fetchReturning(response(status), response(200));

    expect(await outcome(searchRequest(fetchImpl))).toBe(`request failed (${status})`);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("sends no retry when Stop lands as the 429 arrives", async () => {
    const caller = new AbortController();
    const mock = jest.fn<Promise<Response>, [string, RequestInit]>();
    mock
      .mockImplementationOnce(async () => {
        caller.abort();
        return response(429, { "retry-after": "1" });
      })
      .mockResolvedValueOnce(response(200));
    const fetchImpl: HttpFetch = (u, init) => mock(u, init);

    expect(await outcome(searchRequest(fetchImpl, caller.signal))).toBe("cancelled");
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(5000);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a network error", async () => {
    const mock = jest
      .fn<Promise<Response>, [string, RequestInit]>()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(response(200));
    const fetchImpl: HttpFetch = (u, init) => mock(u, init);

    const result = outcome(searchRequest(fetchImpl));
    await jest.advanceTimersByTimeAsync(5000);

    expect(await result).toBe("Network request failed");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a timeout", async () => {
    const mock = jest.fn<Promise<Response>, [string, RequestInit]>(
      (_u, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted upstream")));
        }),
    );
    const fetchImpl: HttpFetch = (u, init) => mock(u, init);

    const result = outcome(
      providerJson(fetchImpl, url, { method: "GET" }, { timeoutMs: 100, retryOn429: true }),
    );
    await jest.advanceTimersByTimeAsync(5000);

    expect(await result).toBe("timed out");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("returns the retry error when the retry fails another way", async () => {
    const { fetchImpl, mock } = fetchReturning(response(429), response(500));

    const result = outcome(searchRequest(fetchImpl));
    await jest.advanceTimersByTimeAsync(1000);

    expect(await result).toBe("request failed (500)");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("rejects without fetching when the caller is already stopped", async () => {
    const { fetchImpl, mock } = fetchReturning(response(200));
    const caller = new AbortController();
    caller.abort();

    await expect(searchRequest(fetchImpl, caller.signal)).rejects.toThrow("cancelled");
    expect(mock).not.toHaveBeenCalled();
  });

  it("hands fetch its own signal and never aborts the caller's", async () => {
    const { fetchImpl, mock } = fetchReturning(response(200));
    const caller = new AbortController();

    await searchRequest(fetchImpl, caller.signal);

    const passed = mock.mock.calls[0][1].signal;
    expect(passed).not.toBe(caller.signal);
    expect(caller.signal.aborted).toBe(false);
  });
});

describe("429 handling by kind", () => {
  it("a search retries a 429 once, then answers", async () => {
    let calls = 0;
    const fetchImpl: HttpFetch = async () => {
      calls += 1;
      if (calls === 1) {
        // Zero wait: the retry is what this test is about, not the clock.
        return jsonResponse("", 429, { "Retry-After": "0" });
      }
      return jsonResponse({
        web: { results: [{ title: "T", url: "https://a.example", description: "s" }] },
        type: "search",
      });
    };
    const out = await braveSearch(fetchImpl, "k", "q", 5);
    expect(out.map((r) => r.url)).toEqual(["https://a.example"]);
    expect(calls).toBe(2);
  });

  it.each([
    ["exa", (f: HttpFetch) => exaRead(f, "k", "https://a.example")],
    ["firecrawl", (f: HttpFetch) => firecrawlRead(f, "k", "https://a.example")],
    ["default", (f: HttpFetch) => readWithDefaultReader(f, "https://a.example")],
  ])("a %s read never retries a 429", async (_name, run) => {
    let calls = 0;
    const fetchImpl: HttpFetch = async () => {
      calls += 1;
      return jsonResponse("", 429, { "Retry-After": "0" });
    };
    await expect(run(fetchImpl)).rejects.toThrow("request failed (429)");
    expect(calls).toBe(1);
  });
});

describe("transport credentials", () => {
  it("omits cookies on JSON and text requests, even when asked to include them", async () => {
    const seen: Array<RequestInit["credentials"]> = [];
    const fetchImpl: HttpFetch = async (_url, init) => {
      seen.push(init.credentials);
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    };

    await providerJson(fetchImpl, "https://t.example", {
      method: "GET",
      credentials: "include",
    });
    await fetchText(fetchImpl, "https://r.jina.ai/x", {
      method: "GET",
      credentials: "include",
    });

    expect(seen).toEqual(["omit", "omit"]);
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
