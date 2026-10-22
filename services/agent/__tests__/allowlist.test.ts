/** Allowlist parity (PocketPal readUrlAllowlist.ts): canonicalization,
 *  site-level user-named hosts, match-key storage, and run-start seeding
 *  from assembled messages + persisted steps. */

import {
  allowReadUrls,
  extractUrls,
  isReadUrlAllowed,
  matchReadUrl,
  resetReadUrlAllowlist,
  seedReadUrlAllowlist,
} from "../allowlist.ts";

beforeEach(() => resetReadUrlAllowlist());

describe("canonicalization", () => {
  it("matches across case, fragments and trailing slashes", () => {
    allowReadUrls(["https://EXAMPLE.com/Page/One"]);
    expect(isReadUrlAllowed("https://example.com/Page/One#frag")).toBe(true);
    expect(isReadUrlAllowed("https://example.com/Page/One/")).toBe(true);
  });

  it("keeps www-stripped hosts equivalent", () => {
    allowReadUrls(["https://www.site.example/a"]);
    expect(isReadUrlAllowed("https://site.example/a")).toBe(true);
  });

  it("refuses non-http(s) schemes and embedded credentials", () => {
    allowReadUrls(["ftp://x.example/a", "https://user:pw@x.example/b"]);
    expect(isReadUrlAllowed("ftp://x.example/a")).toBe(false);
    expect(isReadUrlAllowed("https://user:pw@x.example/b")).toBe(false);
  });

  it("never returns a LOOKUP string the run did not allow", () => {
    // Path swaps must not match: the map key carries the path/search.
    allowReadUrls(["https://site.example/ok"]);
    expect(isReadUrlAllowed("https://site.example/other")).toBe(false);
  });
});

describe("user-named sites (site-level allowance)", () => {
  it("admits any page on a host the user wrote as-written", () => {
    // PocketParity: the host is remembered EXACTLY as the user wrote it;
    // a subdomain the user did not write is a different site.
    seedReadUrlAllowlist([{ role: "user", content: "search en.wikipedia.org for me" }], []);
    expect(isReadUrlAllowed("https://en.wikipedia.org/anything/here")).toBe(true);
    expect(isReadUrlAllowed("https://en.wikipedia.org/wiki/X")).toBe(true);
    expect(isReadUrlAllowed("https://evil-en.wikipedia.org/")).toBe(false);
    expect(isReadUrlAllowed("https://other.example/")).toBe(false);
  });

  it("reads bare hosts and http://-prefixed IPv4 literals; not emails", () => {
    seedReadUrlAllowlist(
      [{ role: "user", content: "look at news.site.example and http://192.168.1.4 please me@corp.example" }],
      [],
    );
    expect(isReadUrlAllowed("https://news.site.example/a")).toBe(true);
    // An IPv4 counts as a site ONLY when it carried a protocol (PocketParity).
    expect(isReadUrlAllowed("https://192.168.1.4/status")).toBe(true);
    // The email's host is not a site the user named.
    expect(isReadUrlAllowed("https://corp.example/")).toBe(false);
  });

  it("ignores assistant-written hostnames entirely", () => {
    seedReadUrlAllowlist(
      [
        { role: "assistant", content: "maybe check attacker.example" },
        { role: "user", content: "ok here is https://safe.example/a" },
      ],
      [],
    );
    expect(isReadUrlAllowed("https://attacker.example/x")).toBe(false);
    expect(isReadUrlAllowed("https://safe.example/a")).toBe(true);
  });
});

describe("persisted-step seeding (PocketPal sessionRows)", () => {
  it("re-seeds search-hit URLs and read_url links from stored steps", () => {
    seedReadUrlAllowlist(
      [],
      [
        { tool: "web_search", data: { hits: [{ url: "https://hit.example/1" }, { url: "https://hit.example/2" }] } },
        // Pre-discriminant rows carry no hits; a malformed row stores nothing.
        { tool: "web_search", data: {} },
        { tool: "read_url", data: { links: ["https://page.example/likes"] } },
      ],
    );
    expect(isReadUrlAllowed("https://hit.example/1")).toBe(true);
    expect(isReadUrlAllowed("https://hit.example/2")).toBe(true);
    expect(isReadUrlAllowed("https://page.example/likes")).toBe(true);
    expect(isReadUrlAllowed("https://never.example")).toBe(false);
  });

  it("skips non-user message roles and drops the previous seed wholly", () => {
    seedReadUrlAllowlist([{ role: "user", content: "old.site.example" }], []);
    expect(isReadUrlAllowed("https://old.site.example")).toBe(true);
    // A new run reseeds from scratch — never carry URLs across runs.
    seedReadUrlAllowlist([{ role: "user", content: "new.site.example" }], []);
    expect(isReadUrlAllowed("https://old.site.example")).toBe(false);
    expect(isReadUrlAllowed("https://new.site.example")).toBe(true);
  });
});

describe("extractUrls", () => {
  it("trimmes balanced parens and trailing punctuation", () => {
    expect(extractUrls("see https://a.example/p (details) end.")).toEqual([
      "https://a.example/p",
    ]);
    expect(extractUrls("up at https://a.example/q) now")).toEqual([
      "https://a.example/q",
    ]);
    expect(extractUrls("none here")).toEqual([]);
  });

  it("feeds matchReadUrl symmetric lookups", () => {
    const [url] = extractUrls("read https://mixed.CASE.example/Path failed");
    allowReadUrls([url]);
    expect(matchReadUrl(url)).toEqual("https://mixed.case.example/Path");
  });
});
