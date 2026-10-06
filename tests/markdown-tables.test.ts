/** Markdown tables (C13): renderer pins.
 * Run: node --test tests/markdown-tables.test.ts
 *
 * The component cannot load in plain-Node (react-native), so this suite
 * reads MarkdownView.tsx as TEXT and pins the decisions the ticket
 * demands: a table override exists, cells have visible structure, wide
 * tables scroll, the module-level renderer identity (streaming) is
 * untouched, and body + reasoning share the one renderer.
 *
 * Column alignment (§3.3) is different: react-native-marked applies it
 * BEFORE our renderer is called, and its util is pure JS, so that half
 * is asserted BEHAVIOURALLY by importing the installed module. Only the
 * "our wrapper does not strip it" half is source-level.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableColAlignmentStyle } from "react-native-marked/dist/module/utils/table.js";

const ROOT = path.join(import.meta.dirname, "..");

/** The three alignments GFM delimiter rows can express. */
type Alignment = "left" | "center" | "right";

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

  it("renders children untouched — the library's per-column style survives", () => {
    // Source-level, not behavioural, and deliberately so: by the time our
    // TableCell runs, the alignment style is already baked into the parsed
    // ReactNodes the library handed us, so there is no node-observable
    // behaviour left to assert without mounting react-native. What we CAN
    // pin is the thing that would actually break it: a wrapper that rebuilds
    // its children with a fresh style, or overwrites textAlign on the cell,
    // would discard the library's alignment. TableCell therefore renders
    // {children} as-is and puts its style on the wrapping View only.
    const cell = src.slice(
      src.indexOf("function TableCell("),
      src.indexOf("function MarkdownTable("),
    );
    assert.ok(cell.length > 0, "TableCell must exist");
    assert.match(cell, /\{children\}/, "children are rendered as received");
    assert.doesNotMatch(
      cell,
      /textAlign|cloneElement|flatten/,
      "the wrapper must not rebuild or re-align its children",
    );
    assert.doesNotMatch(
      cell,
      /style=\{\{[^}]*textAlign/,
      "the cell style carries width/borders only, never an alignment",
    );
  });

  it("maps every GFM delimiter form to its column alignment (library)", () => {
    // Behavioural, against the INSTALLED library: this is the real proof
    // that a left/centre/right delimiter row lands on screen aligned as
    // written. The util is
    // pure ({textAlign} in, {textAlign} out) and imports no react-native,
    // so plain Node can call it directly.
    const cases: [Alignment, Alignment][] = [
      ["left", "left"],
      ["center", "center"],
      ["right", "right"],
    ];
    for (const [delimiter, expected] of cases) {
      assert.deepEqual(
        getTableColAlignmentStyle(delimiter),
        { textAlign: expected },
        "delimiter " + delimiter + " must align its column " + expected,
      );
    }
    // A table written WITHOUT alignment delimiters parses to no align, and
    // must still come out flush left rather than inheriting the last column.
    assert.deepEqual(getTableColAlignmentStyle(undefined), { textAlign: "left" });
  });

  it("the library spreads that style into every cell before our renderer", () => {
    // Closes the loop: the util alone proves nothing unless the parser calls
    // it per column. This is the seam between the two halves of the proof.
    const parser = read("node_modules/react-native-marked/dist/module/lib/Parser.js");
    assert.match(
      parser,
      /header[\s\S]*?getTableColAlignmentStyle\(token\.align\[i\]\)/,
      "header cells take their column's alignment",
    );
    assert.match(
      parser,
      /rows[\s\S]*?getTableColAlignmentStyle\(token\.align\[i\]\)/,
      "body cells take their column's alignment",
    );
    assert.match(parser, /this\.renderer\.table\(header, rows/, "then hands them to our renderer");
  });

  it("body and reasoning share the one renderer", () => {
    // dense only swaps text styles; the same useMarkdown call carries the
    // same renderer, so tables render in the reasoning block too — the
    // ticket's "decide, do not leave half-working" is decided by having
    // no second path at all.
    assert.match(src, /colorScheme: "light",\s*renderer,/, "one renderer, one call site");
  });
});
