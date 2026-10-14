/** Turn footer readings (G4 + prompt throughput), now PocketPal's strings.
 * Run: node --test tests/turn-footer.test.ts
 *
 * The footer is a react-native component, so it cannot be imported here.
 * The wiring is pinned as SOURCE, the same seam font-scale.test.ts uses
 * for the footer's rung: what matters is that each segment is gated on a
 * present, finite reading and formatted the way PocketPal formats it —
 * not which JSX expression spells it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Comments are stripped before scanning: this file's own header QUOTES the
// old strings it is asserting are gone ("5174.513 ms to first token",
// "onRegenerate"), so an unstripped scan matches its own documentation.
const FOOTER = readFileSync(
  path.join(import.meta.dirname, "..", "components", "chat", "MessageActions.tsx"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

describe("turn footer prompt throughput", () => {
  it("reads the projected field, so the engine's own number reaches the UI", () => {
    assert.match(FOOTER, /promptTokensPerSecond/);
  });

  it("gates every segment on present AND finite", () => {
    // Both halves are load-bearing: `!== undefined` alone would render NaN
    // from an engine that reported garbage, and a bare `> 0` would
    // swallow a legitimately reported zero. The shared `finite()` helper
    // is what makes "present AND finite" one rule instead of four.
    assert.match(
      FOOTER,
      /function finite\(value: number \| undefined\)[^{]*\{\s*return typeof value === "number" && Number\.isFinite\(value\)/,
      "one finite() gate, not a hand-rolled check per segment",
    );
    for (const field of ["msPerToken", "tokensPerSecond", "promptTokensPerSecond", "promptMs"]) {
      assert.match(
        FOOTER,
        new RegExp(`finite\\(t\\?\\.${field}\\)`),
        `${field} must go through the shared gate`,
      );
    }
  });

  it("shows a reported zero instead of dropping the segment", () => {
    // The old code gated on `> 0` while its own comment argued the
    // opposite: a zero rate is a measurement. PocketPal's finiteNumber()
    // agrees, so a stalled turn prints 0.00 tokens/sec rather than
    // silently losing the segment.
    assert.doesNotMatch(
      FOOTER,
      /tokensPerSecond > 0|msPerToken > 0/,
      "a reported zero is a measurement, not a missing reading",
    );
  });

  it("formats to two decimals", () => {
    assert.match(FOOTER, /promptTokensPerSec\.toFixed\(2\)/);
    assert.match(FOOTER, /tokensPerSec\.toFixed\(2\)/);
  });
});

describe("turn footer uses PocketPal's strings", () => {
  it("rounds and abbreviates, instead of printing raw floats", () => {
    // Ours printed `5174.513 ms to first token · 24.6 tok/s`; theirs
    // (AssistantTurnFooter + en.json 567-576) prints integers and `TTFT`.
    assert.match(FOOTER, /Math\.round\(msPerToken\)\}ms\/token/);
    assert.match(FOOTER, /Math\.round\(ttft\)\}ms TTFT/);
    assert.doesNotMatch(FOOTER, /ms to first token/, "the raw-float string is gone");
  });

  it("joins the segments with a comma, TTFT last", () => {
    assert.match(FOOTER, /timingParts\.join\(", "\)/);
    // Order is theirs: ms/token, tokens/sec, prompt tokens/sec, TTFT.
    const order = ["ms/token", "tokens/sec", "prompt tokens/sec", "ms TTFT"].map(
      (needle) => FOOTER.indexOf(needle),
    );
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "segments out of order");
  });

  it("keeps the interrupted and truncated markers", () => {
    assert.match(FOOTER, /"Interrupted"/);
    assert.match(FOOTER, /"Cut off — likely context full"/);
  });

  it("regenerate is gone from the footer — it lives in the long-press menu", () => {
    // PocketParity: their footer has no regenerate button; ChatView's
    // context menu carries it. Ours already passed onRegenerate into
    // MessageMenu, so removing the button was all it took.
    assert.doesNotMatch(FOOTER, /RotateCcw/);
    assert.doesNotMatch(FOOTER, /onRegenerate/);
  });

  it("renders nothing when there is nothing to say", () => {
    assert.match(
      FOOTER,
      /if \(timingParts\.length === 0 && marker === null\) return null;/,
      "a bare turn must not add an empty row",
    );
  });

  it("uses a 44dp touch target behind PocketPal's 16px icon", () => {
    // Their hitSlop is 8 (a 32dp target, under the platform minimum).
    // The icon is already 16px on both sides, so this is invisible.
    assert.match(FOOTER, /hitSlop=\{14\}/);
    assert.doesNotMatch(FOOTER, /hitSlop=\{8\}/);
  });
});
