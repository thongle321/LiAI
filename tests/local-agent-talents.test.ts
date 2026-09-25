/** Local agent talents: registry + 4 engines (TDD).
 * Run: node --test frontend/tests/local-agent-talents.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runTalent, talentDefinitions } from "../lib/agent/registry.ts";
import { resetReadUrlAllowlist } from "../lib/agent/allowlist.ts";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("talentDefinitions", () => {
  it("advertises the four on-device talents as function tools", () => {
    const names = talentDefinitions().map((d) => d.function.name);
    assert.deepEqual(names, ["datetime", "calculate", "web_search", "read_url"]);
  });
});

describe("runTalent pure engines", () => {
  it("answers datetime without a key", async () => {
    const out = await runTalent(
      "datetime",
      "{}",
      { fetchImpl: fakeFetch({}), search: null },
    );
    assert.match(out, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("answers calculate without a key", async () => {
    const out = await runTalent(
      "calculate",
      JSON.stringify({ expression: "2 + 3" }),
      { fetchImpl: fakeFetch({}), search: null },
    );
    assert.equal(out, "2 + 3 = 5");
  });

  it("rejects unknown talents and bad JSON without throwing", async () => {
    assert.match(
      await runTalent("nope", "{}", { fetchImpl: fakeFetch({}), search: null }),
      /not enabled/i,
    );
    assert.match(
      await runTalent("calculate", "{bad", {
        fetchImpl: fakeFetch({}),
        search: null,
      }),
      /invalid JSON/i,
    );
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
    assert.match(out, /not enabled|no search key/i);
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
    assert.ok(out.includes("https://t.example"));
    const gated = await runTalent(
      "read_url",
      JSON.stringify({ url: "https://other.example" }),
      {
        fetchImpl: fakeFetch({}),
        search: { provider: "tavily", key: "k", count: 5 },
      },
    );
    assert.match(gated, /not from a web_search result/i);
  });
});

describe("runTalent read_url", () => {
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
    assert.match(out, /only public http/i);
    assert.equal(calls, 0);
  });
});
