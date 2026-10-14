/** Local agent talents: registry + 4 engines (TDD).
 * Run: node --test frontend/tests/local-agent-talents.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runTalent, talentDefinitions } from "../lib/agent/registry.ts";
import {
  allowReadUrls,
  resetReadUrlAllowlist,
} from "../lib/agent/allowlist.ts";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("talentDefinitions", () => {
  it("advertises the on-device talents as function tools", () => {
    const names = talentDefinitions().map((d) => d.function.name);
    // render_html joined this list with the HTML preview port. It is
    // pass-through — the model authors the markup — so it needs no key,
    // which is why it carries no search-auth dependency.
    assert.deepEqual(names, [
      "datetime",
      "calculate",
      "web_search",
      "read_url",
      "render_html",
    ]);
  });
});

describe("runTalent pure engines", () => {
  it("answers datetime without a key", async () => {
    const out = await runTalent(
      "datetime",
      "{}",
      { fetchImpl: fakeFetch({}), search: null },
    );
    assert.equal(out.ok, true);
    assert.match(out.content, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("answers calculate without a key", async () => {
    const out = await runTalent(
      "calculate",
      JSON.stringify({ expression: "2 + 3" }),
      { fetchImpl: fakeFetch({}), search: null },
    );
    assert.equal(out.ok, true);
    assert.equal(out.content, "2 + 3 = 5");
  });

  it("rejects unknown talents and bad JSON without throwing", async () => {
    const unknown = await runTalent("nope", "{}", {
      fetchImpl: fakeFetch({}),
      search: null,
    });
    assert.equal(unknown.ok, false, "an unknown talent did not succeed");
    assert.match(unknown.content, /not enabled/i);
    const badArgs = await runTalent("calculate", "{bad", {
      fetchImpl: fakeFetch({}),
      search: null,
    });
    assert.equal(badArgs.ok, false, "unparseable arguments did not succeed");
    assert.match(badArgs.content, /invalid JSON/i);
  });
});

describe("runTalent web_search", () => {
  it("needs a consented key before fetching", async () => {
    let calls = 0;
    const out = await runTalent("web_search", JSON.stringify({ query: "q" }), {
      fetchImpl: (async () => {
        calls += 1;
        return new Response("{}");
      }) as typeof fetch,
      search: null,
    });
    assert.equal(out.ok, false, "a missing key is a failure, not an empty result");
    assert.match(out.content, /not enabled|no search key/i);
    assert.equal(calls, 0);
  });

  it("returns fenced results and seeds the read allowlist", async () => {
    resetReadUrlAllowlist();
    const out = await runTalent("web_search", JSON.stringify({ query: "q" }), {
      fetchImpl: fakeFetch({
        results: [{ title: "T", url: "https://t.example", content: "snippet" }],
      }),
      search: { provider: "tavily", key: "k", count: 5 },
    });
    assert.equal(out.ok, true);
    assert.ok(out.content.includes("https://t.example"));
    const gated = await runTalent(
      "read_url",
      JSON.stringify({ url: "https://other.example" }),
      {
        fetchImpl: fakeFetch({}),
        search: { provider: "tavily", key: "k", count: 5 },
      },
    );
    assert.equal(gated.ok, false, "an unlisted URL is a refused read, not a read");
    assert.match(gated.content, /not from a web_search result/i);
  });

  it("carries the hits STRUCTURED alongside the fenced markdown", async () => {
    // The criterion this exists for: a renderer must never parse its own
    // markdown back apart. The model reads `content` (fenced, because it
    // is untrusted third-party text); the renderer reads `data`.
    resetReadUrlAllowlist();
    const out = await runTalent(
      "web_search",
      JSON.stringify({ query: "structured-hits-probe-02" }),
      {
        fetchImpl: fakeFetch({
          results: [
            { title: "First", url: "https://one.example", content: "s1" },
            { title: "Second", url: "https://two.example", content: "s2" },
          ],
        }),
        search: { provider: "tavily", key: "k", count: 5 },
      },
    );
    assert.equal(out.ok, true);
    assert.match(out.content, /third-party/, "the model's copy stays fenced");
    const hits = out.data?.hits;
    assert.ok(Array.isArray(hits), "structured hits are present");
    assert.equal(hits.length, 2);
    assert.deepEqual(
      (hits as Array<{ url: string }>).map((h) => h.url),
      ["https://one.example", "https://two.example"],
      "order and urls survive, so no re-derivation is needed",
    );
  });

  it("treats zero results as an empty result, not a failure", async () => {
    // The search WORKED; the answer is that there was nothing to find.
    // Collapsing the two teaches the user that a working search broke.
    // A distinct query: the search layer caches by query, and the sibling
    // test already searched "q" -- reusing it returned that cached result.
    const out = await runTalent(
      "web_search",
      JSON.stringify({ query: "definitely-no-hits-query-01" }),
      {
        fetchImpl: fakeFetch({ results: [] }),
        search: { provider: "tavily", key: "k", count: 5 },
      },
    );
    assert.equal(out.ok, true, "an empty result set is not an error");
    assert.match(out.content, /no results/i);
  });
});

describe("runTalent read_url", () => {
  it("passes a timeout signal on the reader fetch", async () => {
    // The reader is the ONE outbound fetch in the app that used to have
    // no deadline: a server that accepts the connection and then stalls
    // would hold the whole turn (audit finding 3).
    resetReadUrlAllowlist();
    let seen: RequestInit | undefined;
    const out = await runTalent(
      "read_url",
      JSON.stringify({ url: "https://slow.example/article" }),
      {
        fetchImpl: (async (_url: string, init?: RequestInit) => {
          seen = init;
          return new Response("some readable article text");
        }) as unknown as typeof fetch,
        search: null,
      },
    );
    // Seeding happens via userTexts in production; seed directly here.
    void out;
    // Not allowed yet -> refused before fetch. Seed and retry.
    allowReadUrls(["https://slow.example/article"]);
    const read = await runTalent(
      "read_url",
      JSON.stringify({ url: "https://slow.example/article" }),
      {
        fetchImpl: (async (_url: string, init?: RequestInit) => {
          seen = init;
          return new Response("some readable article text");
        }) as unknown as typeof fetch,
        search: null,
      },
    );
    assert.equal(read.ok, true);
    assert.ok(seen, "the reader fetch was called");
    assert.ok(
      seen?.signal instanceof AbortSignal,
      "read_url must carry an AbortSignal so a stalled reader cannot hold the turn",
    );
  });

  it("refuses non-http targets without fetching", async () => {
    let calls = 0;
    const out = await runTalent(
      "read_url",
      JSON.stringify({ url: "file:///etc/passwd" }),
      {
        fetchImpl: (async () => {
          calls += 1;
          return new Response("");
        }) as typeof fetch,
        search: { provider: "tavily", key: "k", count: 5 },
      },
    );
    assert.equal(out.ok, false, "a refused target did not succeed");
    assert.match(out.content, /only public http/i);
    assert.equal(calls, 0);
  });
});
