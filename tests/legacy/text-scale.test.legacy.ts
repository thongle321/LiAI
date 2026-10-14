import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fluidTextVariables, textScaleFactor } from "../themes/textScale.ts";
import { typeScale } from "../themes/tokens.ts";

// DESIGN.md, Fluid Type clause: the type scale is authored at a 375dp
// base; rendered sizes may deviate by 1 + (width/375 − 1) × 0.5,
// clamped to [0.9, 1.1], rounded to whole px. Every expected value
// below is hand-computed from that spec, not from the implementation.

test("the width factor follows the DESIGN formula and clamps", () => {
  const near = (actual: number, expected: number) =>
    assert.ok(
      Math.abs(actual - expected) < 1e-9,
      `expected ${expected}, got ${actual}`,
    );

  near(textScaleFactor(375), 1); // base width: no drift
  near(textScaleFactor(414), 1.052); // 1 + (414/375 − 1) × 0.5
  near(textScaleFactor(360), 0.98); // narrow phone scales down

  assert.equal(textScaleFactor(200), 0.9); // 0.7667 → floor
  assert.equal(textScaleFactor(1000), 1.1); // 1.8333 → ceiling
});

test("the variables map carries every type token and its line height", () => {
  // factor 1.052: h1 32×1.052 = 33.664 → 34, line 40×1.052 = 42.08 → 42.
  // Values are unitless numbers: Uniwind's var getters pass numbers to
  // RN styles raw, and a "34px" string crashes the native RCTText setter.
  const at414 = fluidTextVariables(414);
  assert.equal(at414["--text-h1"], 34);
  assert.equal(at414["--text-h1--line-height"], 42);

  // body-lg is where the camel→kebab mapping can drift (bodyLg → body-lg):
  assert.equal(at414["--text-body-lg"], 17); // 16×1.052 = 16.83
  assert.equal(at414["--text-body-lg--line-height"], 25); // 24×1.052 = 25.25

  // 11 tokens × (size + line height), no more, no less.
  assert.equal(Object.keys(at414).length, 22);

  // The pocketpal-mirror rungs scale like the rest (14×1.052 = 14.73→15):
  assert.equal(at414["--text-title"], 15);
  assert.equal(at414["--text-title--line-height"], 21);
  assert.equal(at414["--text-xs"], 12); // 11×1.052 = 11.57
  assert.equal(at414["--text-micro"], 11); // 10×1.052 = 10.52

  // At base width the map is the identity: tokens pass through untouched.
  const at375 = fluidTextVariables(375);
  assert.equal(at375["--text-caption"], 12);
  assert.equal(at375["--text-caption--line-height"], 16);
});

test("typeScale mirrors global.css — the engine's declared source", () => {
  // The engine scales themes/tokens.ts (node on a device cannot read
  // global.css). DESIGN says the CSS and TS mirrors are identical and
  // a test fails when they drift — which held for colours, but never
  // covered sizes. This closes that: a future global.css-only type edit
  // now fails here instead of silently escaping the fluid scale.
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "global.css"),
    "utf8",
  );
  const fromCss = (name: string): number => {
    const match = css.match(new RegExp(`--text-${name}: (\\d+)px;`));
    assert.ok(match, `global.css has --text-${name}`);
    return Number(match[1]);
  };

  for (const [key, token] of Object.entries(typeScale)) {
    const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    assert.equal(fromCss(name), token.size, `--text-${name} size`);
    assert.equal(
      fromCss(`${name}--line-height`),
      token.lineHeight,
      `--text-${name} line-height`,
    );
  }
});
