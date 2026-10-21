/** PACT gating + talent fragments (PocketPal deriveToolSchemas /
 * collectSystemPromptFragments parity). */

import {
  collectSystemPromptFragments,
  deriveToolSchemas,
  recommendedContextTokens,
  TALENT_NAMES,
} from "@/services/agent/registry.ts";

const CTX = { now: new Date("2026-10-18T10:00:00Z"), maxToolTurns: 5 };

it("offers every talent with no gating list", () => {
  expect(deriveToolSchemas().map((t) => t.function.name)).toEqual([
    ...TALENT_NAMES,
  ]);
});

it("offers a strict subset for a pact, dropping unknown names silently", () => {
  expect(
    deriveToolSchemas(["web_search", "calculate", "not_a_talent"]).map(
      (t) => t.function.name,
    ),
  ).toEqual(["calculate", "web_search"]);
});

it("offers nothing for an empty pact — a no-companion chat sends no tools", () => {
  expect(deriveToolSchemas([])).toEqual([]);
});

it("collects the web_search fragment with date and budget", () => {
  const fragments = collectSystemPromptFragments(["web_search"], CTX);
  expect(fragments.length).toBe(1);
  expect(fragments[0]).toContain("2026-10-18");
  expect(fragments[0]).toContain("budget of 4 tool calls");
  // read_url is NOT active, so the fragment must not name it.
  expect(fragments[0]).not.toContain("read_url");
});

it("names read_url in the fragment only when it is active", () => {
  const fragments = collectSystemPromptFragments(
    ["web_search", "read_url"],
    CTX,
  );
  expect(fragments[0]).toContain("and open pages with read_url");
});

it("collects nothing for talents without a fragment", () => {
  expect(collectSystemPromptFragments(["calculate", "datetime"], CTX)).toEqual(
    [],
  );
});

it("reports the context hints each heavy talent declares", () => {
  expect(recommendedContextTokens("web_search")).toBe(1000);
  expect(recommendedContextTokens("read_url")).toBe(1200);
  expect(recommendedContextTokens("render_html")).toBe(4096);
  expect(recommendedContextTokens("calculate")).toBeUndefined();
});
