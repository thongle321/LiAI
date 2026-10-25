/** Search cancellation (PocketPal #999): every search and every native
 *  read ends with the turn's Stop, and reads never trade that for a
 *  retry. Searches keep their one 429 retry. */

import {
  braveSearch,
  exaRead,
  exaSearch,
  firecrawlRead,
  firecrawlSearch,
  parallelSearch,
  readPage,
  readWithDefaultReader,
  searchWeb,
  tavilySearch,
  youSearch,
  type HttpFetch,
} from "../search.ts";
import { flushTick, hangingFetch } from "@/jest/fixtures/search-transport.ts";

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

interface SearchCase {
  name: string;
  run: (fetchImpl: HttpFetch, signal?: AbortSignal) => Promise<unknown>;
  body: unknown;
}

const SEARCHES: SearchCase[] = [
  {
    name: "tavily",
    run: (f, signal) => tavilySearch(f, "k", "q", 5, signal),
    body: { results: [{ title: "T", url: "https://a.example", content: "s" }] },
  },
  {
    name: "brave",
    run: (f, signal) => braveSearch(f, "k", "q", 5, signal),
    body: {
      type: "search",
      web: { results: [{ title: "T", url: "https://a.example", description: "s" }] },
    },
  },
  {
    name: "exa",
    run: (f, signal) => exaSearch(f, "k", "q", 5, signal),
    body: { results: [{ title: "T", url: "https://a.example", summary: "s" }] },
  },
  {
    name: "firecrawl",
    run: (f, signal) => firecrawlSearch(f, "k", "q", 5, signal),
    body: {
      success: true,
      data: { web: [{ title: "T", url: "https://a.example", description: "s" }] },
    },
  },
  {
    name: "you",
    run: (f, signal) => youSearch(f, "k", "q", 5, signal),
    body: { results: { web: [{ title: "T", url: "https://a.example", description: "s" }] } },
  },
  {
    name: "parallel",
    run: (f, signal) => parallelSearch(f, "k", "q", 5, signal),
    body: { results: [{ title: "T", url: "https://a.example", excerpts: ["s"] }] },
  },
];

describe("search cancellation", () => {
  it.each(SEARCHES)("$name: aborts its request when the turn stops", async ({ run }) => {
    const { fetchImpl, calls } = hangingFetch();
    const controller = new AbortController();
    const pending = run(fetchImpl, controller.signal);
    await flushTick();
    expect(calls).toHaveLength(1);

    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
  });

  it.each(SEARCHES)("$name: resolves without a signal", async ({ run, body }) => {
    const out = await run(async () => jsonResponse(body));
    expect(Array.isArray(out)).toBe(true);
    expect((out as unknown[]).length).toBe(1);
  });

  it("searchWeb hands the signal to the provider", async () => {
    const { fetchImpl, calls } = hangingFetch();
    const controller = new AbortController();
    const pending = searchWeb(fetchImpl, "brave", "k", "q", 5, controller.signal);
    await flushTick();
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
    expect(calls).toHaveLength(1);
  });
});

describe("read cancellation", () => {
  it("cancels an Exa native read", async () => {
    const { fetchImpl } = hangingFetch();
    const controller = new AbortController();
    const pending = exaRead(fetchImpl, "k", "https://a.example", controller.signal);
    await flushTick();
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("cancels a Firecrawl native read", async () => {
    const { fetchImpl } = hangingFetch();
    const controller = new AbortController();
    const pending = firecrawlRead(fetchImpl, "k", "https://a.example", controller.signal);
    await flushTick();
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("cancels the default reader", async () => {
    const { fetchImpl } = hangingFetch();
    const controller = new AbortController();
    const pending = readWithDefaultReader(fetchImpl, "https://a.example", controller.signal);
    await flushTick();
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("cancels whichever reader readPage routes to", async () => {
    for (const provider of ["exa", "firecrawl", "brave"]) {
      const { fetchImpl } = hangingFetch();
      const controller = new AbortController();
      const pending = readPage(
        fetchImpl,
        provider,
        "k",
        "https://a.example",
        controller.signal,
      );
      await flushTick();
      controller.abort();
      await expect(pending).rejects.toThrow("cancelled");
    }
  });

  it("reads resolve without a signal", async () => {
    await expect(
      exaRead(async () => jsonResponse({ results: [{ text: "page" }] }), "k", "https://a.example"),
    ).resolves.toEqual({ url: "https://a.example", text: "page" });
    await expect(
      firecrawlRead(
        async () =>
          jsonResponse({ success: true, data: { markdown: "page", metadata: {} } }),
        "k",
        "https://a.example",
      ),
    ).resolves.toEqual({ url: "https://a.example", text: "page" });
    await expect(
      readWithDefaultReader(async () => new Response("page"), "https://a.example"),
    ).resolves.toEqual({ url: "https://a.example", text: "page" });
  });
});
