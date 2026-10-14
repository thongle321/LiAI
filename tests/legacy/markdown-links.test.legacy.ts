/** Markdown link opening (C2): the scheme guard and the renderer pins.
 * Run: node --test tests/markdown-links.test.ts
 *
 * The guard is the load-bearing half — a markdown body is untrusted
 * content, so `file:`/`javascript:` must never reach Linking. The
 * MarkdownView pins read the component as TEXT (react-native cannot load
 * in plain-Node), asserting the override exists and keeps selection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isOpenableUrl } from "../lib/chat/links.ts";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("isOpenableUrl", () => {
  it("opens plain http(s) — PocketPal's guard verbatim", () => {
    // pocketpal-ai WebSearchResultsSheet.tsx:24: /^https?:\/\//i
    assert.equal(isOpenableUrl("https://example.com/a?b=c#frag"), true);
    assert.equal(isOpenableUrl("http://example.com"), true);
    assert.equal(isOpenableUrl("HTTPS://EXAMPLE.COM"), true);
  });

  it("refuses every other scheme and every bare form", () => {
    for (const bad of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>x</script>",
      "tel:1234",
      "intent://scan/#Intent;end",
      "example.com",
      "www.example.com",
      "",
    ]) {
      assert.equal(isOpenableUrl(bad), false, bad);
    }
  });
});

describe("ChatRenderer wiring (C2)", () => {
  const src = read("components/chat/MarkdownView.tsx");

  it("overrides link(): guarded open, and a surface on failure", () => {
    assert.match(src, /link\(\s*children/, "a link() override must exist");
    assert.match(src, /isOpenableUrl\(href\)/, "the guard gates the press");
    assert.match(src, /Linking\.openURL\(href\)/, "opens via Linking");
    assert.match(
      src,
      /onPress=\{\(\) => openLink\(href\)\}/,
      "the press is wired to the guarded open, not just present nearby",
    );
    assert.match(
      src,
      /setChatWarning\(\{[\s\S]*?Couldn't open that link/,
      "failure raises the inline notice, not silence",
    );
  });

  it("guards linked images the same way — no unguarded Linking call remains", () => {
    assert.match(src, /linkImage\(/, "a linkImage() override must exist");
    const openCalls = src.match(/Linking\.openURL\(/g) ?? [];
    assert.equal(openCalls.length, 1, "one guarded open, shared by both overrides");
  });

  it("keeps selection and the link semantics", () => {
    assert.match(
      src,
      /selectable=\{this\.selectableText\}/,
      "long-press selection must survive the override",
    );
    assert.match(src, /accessibilityRole="link"/, "announces as a link");
    assert.match(src, /accessibilityHint=\{href\}/, "the href is the hint");
  });

  it("renders an unopenable href as plain text, never an inert link", () => {
    assert.match(
      src,
      /if \(!isOpenableUrl\(href\)\) \{\s*return this\.text\(children\);/,
      "no link styling, no press — plain text",
    );
  });
});
