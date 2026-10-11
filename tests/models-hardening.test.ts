/** Hardening for the models cluster: the two places an arbitrary string can
 *  break a row.
 *
 * WHY A SOURCE SCAN: node cannot render React Native, but the failure is a
 *  bound the code either declares or does not. Both of these shipped because
 *  "the Text will wrap" was assumed.
 *
 * Run: node --test tests/models-hardening.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The opening <Text …> tag that renders `needle`, plus a little of its
 *  body — enough to read the bounding props off it. */
function textTagContaining(rel: string, needle: string): string {
  const src = read(rel);
  const at = src.indexOf(needle);
  assert.ok(at >= 0, `${rel}: no text renders "${needle}"`);
  const open = src.lastIndexOf("<Text", at);
  assert.ok(open >= 0, `${rel}: "${needle}" has no <Text>`);
  return src.slice(open, src.indexOf(">", open) + 1);
}

describe("unbounded strings", () => {
  it("a remote provider's URL row cannot grow without bound", () => {
    // baseUrl and modelName are user-typed, and a pasted endpoint can be a
    // long unbroken host path. Wrapping bounds the WIDTH but not the height,
    // so an unbounded line grows the card a row at a time.
    const tag = textTagContaining(
      "components/models/ModelCard.tsx",
      "{item.baseUrl} • {item.modelName}",
    );
    assert.match(tag, /numberOfLines=\{2\}/, "the URL row must be line-bounded");
  });

  it("a stop word cannot stretch its chip past the row", () => {
    // The field accepts a PASTED list, so one chip can arrive holding a long
    // phrase. flex-wrap re-flows the row between chips; it cannot break one
    // chip, whose width is its content.
    const src = read("components/models/ModelSettingsSheet.tsx");
    const chip = src.slice(src.indexOf("stopWords.map"), src.indexOf("Add new stop word"));
    assert.match(chip, /max-w-\[/, "the chip needs a width bound");
    assert.match(chip, /numberOfLines=\{1\}/, "and its label must truncate");
  });
});
