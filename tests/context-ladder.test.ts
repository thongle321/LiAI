/** Context ladder construction (ticket 07).
 * Run: node --test tests/context-ladder.test.ts
 *
 * Two blocks, as in context-banner-variants.test.ts: the ladder builder is
 * pure and is exercised directly; the sheet that renders it and the reload
 * it performs are pinned by reading the source as TEXT, because a
 * react-native import cannot execute under node --test.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONTEXT_LADDER,
  approxWords,
  buildContextLadder,
  labelTokens,
} from "../lib/chat/context-ladder.ts";
import type { FitStatus } from "../lib/models/context-fit.ts";

const GB = 1024 * 1024 * 1024;

/** Fit status by a flat byte cost per token — enough to place the zones. */
const fitByBytes = (bytesPerToken: number) => {
  const fits: number[] = [];
  return (nCtx: number): FitStatus => {
    const bytes = nCtx * bytesPerToken;
    if (bytes <= 3 * GB) return "fits";
    if (bytes <= 8 * GB) return "tight";
    return "wont_fit";
  };
};

const build = (over: Partial<Parameters<typeof buildContextLadder>[0]> = {}) =>
  buildContextLadder({
    currentNCtx: 4096,
    modelMaxNCtx: 8192,
    fitStatusFor: () => "fits",
    memBytesFor: () => 2 * GB,
    ...over,
  });

describe("labelling", () => {
  it("reads in thousands, integral without a decimal", () => {
    assert.equal(labelTokens(6144), "6K");
    assert.equal(labelTokens(12288), "12K");
    assert.equal(labelTokens(4096), "4K");
  });

  it("keeps one decimal only when the thousands are not integral", () => {
    assert.equal(labelTokens(31744), "31K");
    assert.equal(labelTokens(2560), "2.5K");
  });

  it("derives an approximate word count from the tokens", () => {
    // 0.75 words per token, rounded to the nearest hundred.
    assert.equal(approxWords(4096), 3100);
    assert.equal(approxWords(12288), 9200);
  });
});

describe("ladder construction", () => {
  it("offers only sizes above the current setting", () => {
    const { stops } = build({ currentNCtx: 4096, modelMaxNCtx: 32768 });
    assert.ok(stops.every((s) => s.tokens > 4096));
    assert.ok(!stops.some((s) => s.tokens === 4096));
  });

  it("offers nothing at or above the model's own maximum", () => {
    const { stops } = build({ modelMaxNCtx: 8192 });
    assert.deepEqual(stops.map((s) => s.tokens), [6144, 8192]);
  });

  it("appends the model maximum as the rightmost stop when it is off the ladder", () => {
    const { stops } = build({ modelMaxNCtx: 100000 });
    assert.equal(stops[stops.length - 1].tokens, 100000);
  });

  it("does not duplicate a maximum that is already a stop", () => {
    const { stops } = build({ modelMaxNCtx: 8192 });
    assert.equal(stops.filter((s) => s.tokens === 8192).length, 1);
  });

  it("stops at the model's maximum, never beyond it", () => {
    const { stops } = build({ currentNCtx: 2048, modelMaxNCtx: 10000 });
    assert.ok(stops.every((s) => s.tokens <= 10000));
  });

  it("carries the memory cost, the word count and this device's fit for each stop", () => {
    const { stops } = build({
      modelMaxNCtx: 32768,
      fitStatusFor: fitByBytes(160_000),
      memBytesFor: (n) => n * 160_000,
    });
    const eight = stops.find((s) => s.tokens === 8192);
    assert.ok(eight);
    assert.equal(eight.memBytes, 8192 * 160_000);
    assert.equal(eight.words, approxWords(8192));
    assert.ok(
      ["fits", "tight", "wont_fit"].includes(eight.fit),
      "every stop is classified",
    );
    assert.equal(
      stops.find((s) => s.tokens === 8192)?.fit,
      eight.fit,
      "classification is not recomputed per render",
    );
  });

  it("labels every stop in thousands", () => {
    const { stops } = build({ modelMaxNCtx: 131072 });
    for (const stop of stops) assert.equal(stop.label, labelTokens(stop.tokens));
  });

  it("is empty once the model is already at its maximum", () => {
    const { stops, anyFits, defaultIndex } = build({
      currentNCtx: 8192,
      modelMaxNCtx: 8192,
    });
    assert.deepEqual(stops, []);
    assert.equal(anyFits, false);
    assert.equal(defaultIndex, 0);
  });
});

describe("the selected stop", () => {
  it("opens on the first size that fits", () => {
    // 6144 tight, 8192 fits, 12288 fits -> the first fitting stop is 8192.
    const { stops, defaultIndex } = build({
      currentNCtx: 4096,
      modelMaxNCtx: 16384,
      fitStatusFor: (n) => (n <= 6144 ? "tight" : "fits"),
    });
    assert.deepEqual(stops.map((s) => s.tokens), [6144, 8192, 12288, 16384]);
    assert.equal(stops[defaultIndex].tokens, 8192);
    assert.equal(stops[defaultIndex].fit, "fits");
  });

  it("falls back to the smallest upgrade when nothing fits", () => {
    const { anyFits, defaultIndex } = build({ fitStatusFor: () => "wont_fit" });
    assert.equal(anyFits, false);
    assert.equal(defaultIndex, 0, "the first stop, so the sheet can say why");
  });

  it("reports no fitting size when every stop is tight or worse", () => {
    const { anyFits } = build({ fitStatusFor: () => "tight" });
    assert.equal(anyFits, false);
  });

  it("keeps PocketPal's ladder stops", () => {
    assert.deepEqual(
      [...CONTEXT_LADDER],
      [
        2048, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304,
        131072,
      ],
    );
  });
});

describe("sheet wiring (source assertion)", () => {
  // Everything below is behaviour that cannot run outside React Native: the
  // sheet imports react-native and the reload drives the native engine slot.
  // Reading the source as text is the only seam available, so the decision is
  // pinned where it is written.
  const src = readFileSync(
    new URL("../components/chat/ContextFullBanner.tsx", import.meta.url),
    "utf8",
  );
  const sheet = src.slice(src.indexOf("export function ContextLadderSheet"));

  it("draws each stop with its memory cost, word count and fit marker", () => {
    assert.match(sheet, /stop\.label/);
    assert.match(sheet, /formatBytes\(stop\.memBytes\)/);
    assert.match(sheet, /stop\.words/);
    assert.match(sheet, /fitClass/);
    assert.match(sheet, /fitLabel\(stop\.fit\)/);
  });

  it("colours the fit marker from the error/warning/success tokens", () => {
    assert.match(
      sheet,
      /stop\.fit === "fits"\s*\?[^;]*(success|text-success)/,
      "a fitting stop reads as success",
    );
    assert.match(sheet, /text-error/);
    assert.match(sheet, /text-warning/);
  });

  it("reloads at the chosen size on confirm", () => {
    assert.match(sheet, /setNCtx\(chosen\.tokens\)/);
    assert.match(sheet, /await reloadLocalEngine\(\)/);
  });

  it("restores the previous size and re-initialises when the reload fails", () => {
    assert.match(sheet, /setNCtx\(previousNCtx\)/);
    // The recovery must be attempted and its failure swallowed, so the
    // new-chat action stays reachable.
    assert.match(
      sheet,
      /setNCtx\(previousNCtx\);[\s\S]{0,200}try \{[\s\S]{0,200}reloadLocalEngine\(\)[\s\S]{0,120}\} catch \{[\s\S]{0,160}\}/,
    );
  });

  it("replaces the picker with an explanation and a new chat when nothing fits", () => {
    assert.match(sheet, /anyFits === false/);
    const noFit = sheet.slice(
      sheet.indexOf("anyFits === false"),
      sheet.indexOf(") : ("),
    );
    assert.match(noFit, /onNewChat/, "a new chat is offered");
    assert.doesNotMatch(
      noFit,
      /Confirm/,
      "no confirm button in the no-fit branch, disabled or otherwise",
    );
  });

  it("says reloading takes a few seconds and loses nothing", () => {
    assert.match(sheet, /few seconds/i);
    assert.match(sheet, /nothing.*lost|lose nothing|nothing in this chat is lost/i);
  });

  it("no longer claims the model metadata is unpopulated", () => {
    assert.doesNotMatch(
      src,
      /ggufMetadata` is never populated/,
      "the stale comment this ticket owns",
    );
  });

  it("leaves which variant shows, and whether more room exists, to the banner", () => {
    const banner = src.slice(
      src.indexOf("export function ContextFullBanner"),
      src.indexOf("export function ContextLadderSheet"),
    );
    assert.match(banner, /canIncrease/);
    assert.doesNotMatch(sheet, /resolveBannerVariant|hasFittingUpgrade/);
  });

  it("does not treat a remote endpoint's context setting as a trained maximum", () => {
    // The bound comes from the GGUF header, read where the ladder is built.
    const hook = readFileSync(
      new URL("../hooks/useContextLadder.ts", import.meta.url),
      "utf8",
    );
    assert.match(hook, /maxContextLength/);
    assert.doesNotMatch(
      hook,
      /contextLength[^)]*remote|remote[^)]*contextLength/,
      "a remote model's context length is a server setting, not a maximum",
    );
  });
});