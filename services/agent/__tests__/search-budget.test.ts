/** PocketParity budgeting: token ceiling, drop-hits-whole, word-boundary
 *  cuts, per-field caps, and the LRU hit cache (searchBudget.ts port). */

import {
  budgetHits,
  budgetPage,
  cacheKey,
  getCachedHits,
  resetSearchCache,
  setCachedHits,
  TITLE_MAX_CHARS,
  truncateOnWordBoundary,
} from "../search-budget.ts";
import type { SearchHit } from "../search-budget.ts";

/** PocketParity's exact model-visible renderer for a hit. */
const renderHit = (hit: SearchHit): string => {
  const date = hit.publishedAt ? ` *(${hit.publishedAt})*` : "";
  const lines = [`- **${hit.title || hit.url}**${date}`];
  if (hit.snippet) {
    lines.push(`  ${hit.snippet}`);
  }
  lines.push(`  <${hit.url}>`);
  return lines.join("\n");
};

const BUDGET = { maxResults: 5, perSnippetChars: 280, tokenCeiling: 1000 };

const hit = (over: Partial<SearchHit> = {}): SearchHit => ({
  title: "t",
  url: "https://x.example",
  snippet: "s",
  ...over,
});

describe("budgetHits", () => {
  it("renders titles bare and snippets plain — the model reads plain text", () => {
    const clean = budgetHits(
      [
        {
          title: "<b>Bold</b> *title*",
          url: "https://x.example",
          // PocketParity semantics: a markdown LINK collapses to its label
          // (the URL rides the link, not the snippet), and a BARE url
          // span survives; emphasis markers go.
          snippet: "[label](https://y.example) and bare https://z.example `_em_`",
        },
      ],
      BUDGET,
      renderHit,
    );
    expect(clean[0].title).toEqual("Bold title");
    expect(clean[0].snippet).toEqual("label and bare https://z.example em");
  });

  it("drops hits whole at the token ceiling — never truncates mid-fact", () => {
    // Snippets WITHIN the per-hit cap, so any ellipsis would be the token
    // ceiling cutting a hit — which must instead drop the WHOLE hit.
    const hits = Array.from({ length: 40 }, (_, i) =>
      hit({ title: `t${i}`, snippet: "word ".repeat(20) }),
    );
    const out = budgetHits(hits, BUDGET, renderHit);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(40);
    // Every survivor keeps a FULL snippet, not a cut one.
    for (const h of out) {
      expect(h.snippet.endsWith("…")).toBe(false);
      // "word ".repeat(20) collapses to 99 chars (trailing space trimmed).
      expect(h.snippet.length).toEqual(99);
    }
  });

  it("caps the snippet at perSnippetChars on a word boundary", () => {
    const long = "word ".repeat(100); // 500 chars
    const out = budgetHits([hit({ snippet: long })], BUDGET, renderHit);
    expect(out[0].snippet.length).toBeLessThanOrEqual(280);
    expect(out[0].snippet.endsWith("…")).toBe(true);
  });

  it("caps the title at 200 chars (plus the ellipsis marker)", () => {
    const out = budgetHits([hit({ title: "a".repeat(500) })], BUDGET, renderHit);
    // truncateOnWordBoundary appends … to the cut: 200 content chars + 1.
    expect(out[0].title.length).toBeLessThanOrEqual(TITLE_MAX_CHARS + 1);
    expect(out[0].title.endsWith("…")).toBe(true);
  });

  it("drops a URL past the max-chars cap instead of cutting it", () => {
    const longUrl = `https://x.example/${"a".repeat(3000)}`;
    const out = budgetHits([hit({ url: longUrl })], BUDGET, renderHit);
    expect(out).toEqual([]);
  });

  it("honors maxResults", () => {
    const out = budgetHits(
      Array.from({ length: 8 }, () => hit()),
      { ...BUDGET, maxResults: 3 },
      renderHit,
    );
    expect(out.length).toEqual(3);
  });

  it("keeps publishedAt when the provider supplied it", () => {
    const out = budgetHits(
      [hit({ publishedAt: "2026-01-01" })],
      { ...BUDGET, perSnippetChars: 500, tokenCeiling: 100000 },
      renderHit,
    );
    expect(out[0].publishedAt).toEqual("2026-01-01");
  });

  it("keeps an emoji-safe cut (never splits a surrogate pair)", () => {
    const cut = truncateOnWordBoundary("word word 👍🏽 more text", 10);
    // No unpaired trailing surrogate in the cut.
    const code = cut.codePointAt(cut.length - 1) ?? 0;
    const penultimate = cut.codePointAt(cut.length - 2) ?? 0;
    const high = code >= 0xd800 && code <= 0xdbff;
    expect(high).toBe(false);
    expect(penultimate).not.toEqual(undefined);
  });
});

describe("budgetPage", () => {
  it("clamps page text to the token ceiling in chars (… marks the cut)", () => {
    const page = { url: "https://x.example", title: "T", text: "x".repeat(10_000) };
    const out = budgetPage(page, 1200);
    // 4800 content chars + the ellipsis.
    expect(out.text.length).toEqual(1200 * 4 + 1);
    expect(out.text.endsWith("…")).toBe(true);
  });

  it("strips markup and clamps the title like hits", () => {
    const page = { url: "https://x.example", title: "## heading", text: "**bold** [l](https://y.example) bare https://z.example" };
    const out = budgetPage(page, 1200);
    expect(out.title).toEqual("heading");
    // Link → its label; bare url kept.
    expect(out.text).toEqual("bold l bare https://z.example");
  });

  it("returns the url untouched", () => {
    const out = budgetPage({ url: "https://x.example/a", text: "" }, 1200);
    expect(out.url).toEqual("https://x.example/a");
  });
});

describe("hit cache (LRU 50, no ttl, budgeted hits only)", () => {
  beforeEach(() => resetSearchCache());

  it("round-trips on provider+query+count", () => {
    setCachedHits("brave", "q", 5, [hit()]);
    expect(getCachedHits("brave", "q", 5)).toEqual([hit()]);
    expect(getCachedHits("brave", "q", 4)).toBeUndefined();
    expect(getCachedHits("tavily", "q", 5)).toBeUndefined();
  });

  it("km key NEVER carries the secret", () => {
    expect(cacheKey("brave", "q", 5)).toEqual("brave::5::q");
  });

  it("resets wholesale (store consent/provider/key changes call this)", () => {
    setCachedHits("brave", "q", 5, [hit()]);
    resetSearchCache();
    expect(getCachedHits("brave", "q", 5)).toBeUndefined();
  });

  it("evicts the oldest entry past 50 (get does not promote)", () => {
    for (let i = 0; i < 50; i += 1) {
      setCachedHits("brave", `q${i}`, 5, [hit({ snippet: `${i}` })]);
    }
    setCachedHits("brave", "q50", 5, [hit({ snippet: "50" })]);
    // Insertion-order eviction, PocketParity: reads leave the order alone.
    expect(getCachedHits("brave", "q0", 5)).toBeUndefined(); // evicted
    expect(getCachedHits("brave", "q1", 5)).toBeDefined();
    expect(getCachedHits("brave", "q50", 5)).toBeDefined();
  });
});
