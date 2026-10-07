/** Turn footer readings (G4 + prompt throughput).
 * Run: node --test tests/turn-footer.test.ts
 *
 * The footer is a react-native component, so it cannot be imported here.
 * The wiring is pinned as SOURCE, the same seam font-scale.test.ts uses
 * for the footer's rung: what matters is that the segment is gated on a
 * present, finite field and formatted to two decimals — not which JSX
 * expression spells it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const FOOTER = readFileSync(
  path.join(import.meta.dirname, "..", "components", "chat", "MessageActions.tsx"),
  "utf8",
);

describe("turn footer prompt throughput", () => {
  it("reads the projected field, so the engine's own number reaches the UI", () => {
    assert.match(FOOTER, /promptTokensPerSecond/);
  });

  it("gates the segment on present AND finite", () => {
    // Both halves are load-bearing: `!== undefined` alone would render
    // NaN from an engine that reported garbage, and a bare `> 0` would
    // swallow a legitimately reported zero.
    assert.match(
      FOOTER,
      /promptTokensPerSecond !== undefined && Number\.isFinite\([\s\S]*?promptTokensPerSecond/,
      "the segment must require a finite, present reading",
    );
  });

  it("formats to two decimals", () => {
    assert.match(FOOTER, /promptTokensPerSecond\.toFixed\(2\)/);
  });

  it("leaves the existing readings alone", () => {
    // Requirement 23: adding one segment must not disturb the rest.
    assert.match(FOOTER, /`\$\{t\.promptMs\} ms to first token`/);
    assert.match(FOOTER, /t\.tokensPerSecond\.toFixed\(1\)/);
    assert.match(FOOTER, /t\.msPerToken\.toFixed\(1\)/);
  });
});
