/** Markdown tables (C13): renderer pins.
 * Run: node --test tests/markdown-tables.test.ts
 *
 * The component cannot load in plain-Node (react-native), so this suite
 * reads MarkdownView.tsx as TEXT and pins the decisions the ticket
 * demands: a table override exists, cells have visible structure, wide
 * tables scroll, the module-level renderer identity (streaming) is
 * untouched, and body + reasoning share the one renderer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ChatRenderer table (C13)", () => {
  const src = read("components/chat/MarkdownView.tsx");

  it("overrides table() — the hook exists and is wired to our grid", () => {
    // react-native-marked's RendererInterface DOES expose table(...) —
    // verified against node_modules .../lib/types.ts:86 — so the ticket's
    // "verify before designing" resolves to: override, don't reinvent.
    assert.match(src, /table\(\s*header: ReactNode\[\]\[\]/, "a table() override must exist");
  });

  it("gives cells visible structure: borders and a header fill", () => {
    assert.match(
      src,
      /border-l border-t border-border bg-surface-2/,
      "the header row carries its own fill so it is distinguishable",
    );
    assert.match(
      src,
      /border-b border-r border-border/,
      "cells draw the grid lines",
    );
  });

  it("sizes every column from one shared width so rows line up", () => {
    // Content-sizing each row independently made the vertical borders
    // drift between header and body — the grid read broken (C13 review).
    // The library's own getTableWidthArr fixes one width for all rows.
    assert.match(src, /const COLUMN_WIDTH =/, "one width, computed once");
    assert.match(
      src,
      /style=\{\{ width: COLUMN_WIDTH \}\}/,
      "every cell — header and body — takes that width",
    );
  });

  it("scrolls wide tables horizontally instead of clipping", () => {
    assert.match(src, /ScrollView horizontal/, "wide tables must scroll");
  });

  it("keeps the module-level renderer identity for streaming", () => {
    // A renderer created inside the component would remount every table
    // (and every keyed node) on each token re-parse.
    assert.match(
      src,
      /^const renderer = new ChatRenderer\(/m,
      "the renderer stays module-level",
    );
  });

  it("body and reasoning share the one renderer", () => {
    // dense only swaps text styles; the same useMarkdown call carries the
    // same renderer, so tables render in the reasoning block too — the
    // ticket's "decide, do not leave half-working" is decided by having
    // no second path at all.
    assert.match(src, /colorScheme: "light",\s*renderer,/, "one renderer, one call site");
  });
});
