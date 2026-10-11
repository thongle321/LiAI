import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Parse a hex colour out of a CSS custom property in global.css. */
function token(css: string, name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `global.css must define --color-${name}`);
  return m[1];
}

/** Parse a hex value out of themes/tokens.ts. */
function tsToken(src: string, name: string): string {
  const m = src.match(new RegExp(`\\b${name}:\\s*"(#[0-9A-Fa-f]{6})"`));
  assert.ok(m, `themes/tokens.ts must define ${name}`);
  return m[1];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgbToLinear((n >> 16) & 0xff) +
    0.7152 * srgbToLinear((n >> 8) & 0xff) +
    0.0722 * srgbToLinear(n & 0xff)
  );
}

/** WCAG 2.x contrast ratio, rounded to 2dp for readable failure output. */
function contrast(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

const css = read("global.css");
const ts = read("themes/tokens.ts");

// ---------------------------------------------------------------- the role split

test("the signal is one hue carried by two steps, not two colours", () => {
  // The whole point of the split. If these ever diverge in hue, the app has
  // two blues and the "one signal" rule is a lie.
  const mark = token(css, "primary-mark");
  const text = token(css, "primary");
  const hueOf = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 0xff) / 255;
    const g = ((n >> 8) & 0xff) / 255;
    const b = (n & 0xff) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return Math.round(((h * 60) % 360 + 360) % 360);
  };
  assert.ok(
    Math.abs(hueOf(mark) - hueOf(text)) <= 12,
    `primary ${text} and primary-mark ${mark} must read as one hue; steps of a palette built by eye differ by a few degrees (these are ${hueOf(text)} and ${hueOf(mark)})`,
  );
  assert.notEqual(mark, text, "the two steps must actually differ, or there is no split");
});

test("each step is used in the role it can legally fill", () => {
  // The pairing, stated as a pairing. Note what is NOT asserted: that
  // primary-mark clears 4.5:1. It must not — being 3.69:1 is exactly what
  // makes it a mark. Demanding AA of the mark token would defeat the split
  // and quietly re-merge the two roles.
  const mark = token(css, "primary-mark");
  const text = token(css, "primary");
  const white = token(css, "surface-1");
  assert.ok(
    contrast(text, white) >= AA_TEXT,
    `primary ${text} carries text and fills, so it must clear 4.5:1 on white (is ${contrast(text, white)}:1)`,
  );
  assert.ok(
    contrast(mark, white) >= AA_NON_TEXT,
    `primary-mark ${mark} only ever marks, so it must clear the 3:1 floor (is ${contrast(mark, white)}:1)`,
  );
  assert.ok(
    contrast(mark, white) < AA_TEXT,
    `primary-mark ${mark} must NOT be usable as text; if it clears 4.5:1 the two steps have collapsed into one role`,
  );
});

// ------------------------------------------------------------- every text role

test("every text-on-surface pair clears 4.5:1", () => {
  const surfaces = {
    "clean white (card)": token(css, "surface-1"),
    "cool paper (page)": token(css, "base"),
    "mist (recessed)": token(css, "surface-2"),
    "surface tint (selected)": token(css, "surface-3"),
  };
  const inks = {
    "primary": token(css, "primary"),
    "primary text / ink": token(css, "primary-text"),
    "secondary text / slate": token(css, "secondary-text"),
    "secondary text muted": token(css, "secondary-text-muted"),
    "error": token(css, "error"),
    "success deep (download label)": token(css, "success-deep"),
  };
  const failures: string[] = [];
  for (const [inkName, ink] of Object.entries(inks)) {
    for (const [surfaceName, surface] of Object.entries(surfaces)) {
      const r = contrast(ink, surface);
      if (r < AA_TEXT) failures.push(`${inkName} on ${surfaceName} = ${r}:1`);
    }
  }
  assert.deepEqual(failures, [], `text roles below 4.5:1 — ${failures.join(", ")}`);
});

test("labels on their own fills clear 4.5:1", () => {
  // A fill is only as accessible as the label sitting on it.
  const pairs: Array<[string, string, string]> = [
    ["on-primary label on primary fill", token(css, "on-primary"), token(css, "primary")],
    ["error label on error fill", token(css, "on-primary"), token(css, "error")],
    ["success-deep label on success-fill", token(css, "success-deep"), token(css, "success-fill")],
  ];
  const failures = pairs
    .map(([name, fg, bg]) => ({ name, r: contrast(fg, bg) }))
    .filter((p) => p.r < AA_TEXT)
    .map((p) => `${p.name} = ${p.r}:1`);
  assert.deepEqual(failures, [], `labels on fills below 4.5:1 — ${failures.join(", ")}`);
});

// --------------------------------------------------------- every non-text role

test("the accent hues each carry two steps, never one collapsed role", () => {
  // The signal's split is asserted above. Same rule for the other two hues
  // that do more than one job: the mark step must clear 3:1 (it marks) and
  // must NOT clear 4.5:1 (or the two roles have merged and a site will
  // start using the mark as text). The download green is the newest pair.
  for (const [hue, mark, deep] of [
    ["red", "error-mark", "error"],
    ["green", "success-mark", "success-deep"],
  ] as const) {
    const onWhite = contrast(token(css, mark), token(css, "surface-1"));
    assert.ok(
      onWhite >= AA_NON_TEXT,
      `${hue} mark step ${token(css, mark)} clears only ${onWhite}:1, under the 3:1 non-text floor`,
    );
    assert.ok(
      onWhite < AA_TEXT,
      `${hue} mark step ${token(css, mark)} also clears 4.5:1 — the two steps have collapsed into one role`,
    );
    assert.notEqual(token(css, mark), token(css, deep), `${hue}'s two steps must differ`);
  }
});

test("every mark role clears the 3:1 non-text floor", () => {
  // The accent marks only. `--color-border` is deliberately NOT here: a
  // hairline divider is decorative structure, exempt from WCAG 1.4.11
  // (which covers controls, icons and focus indicators, not separators that
  // carry no information of their own), and at 1.23:1 on white it could
  // never pass. Asserting it would make this suite unpassable by design.
  const marks: Array<[string, number]> = [
    ["primary mark on white", contrast(token(css, "primary-mark"), token(css, "surface-1"))],
    ["primary mark on paper", contrast(token(css, "primary-mark"), token(css, "base"))],
    ["error mark on white", contrast(token(css, "error-mark"), token(css, "surface-1"))],
    ["primary text step as a mark on white", contrast(token(css, "primary"), token(css, "surface-1"))],
    ["success mark (download border) on white", contrast(token(css, "success-mark"), token(css, "surface-1"))],
    ["success mark (download border) on its own fill", contrast(token(css, "success-mark"), token(css, "success-fill"))],
  ];
  const failures = marks
    .map(([name, r]) => ({ name, r }))
    .filter((m) => m.r < AA_NON_TEXT)
    .map((m) => `${m.name} = ${m.r}:1`);
  assert.deepEqual(failures, [], `marks below 3:1 — ${failures.join(", ")}`);
});

// ------------------------------------------------- no alpha on a text class

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const modelStore = join(ROOT, "models");
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry === "pocketpal-ai") continue;
    const full = join(dir, entry);
    if (full === modelStore) continue;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("no text colour is dimmed with an alpha modifier", () => {
  // The failure this closes: `text-secondary-text/70` on 14px body text
  // composited Slate to 3.59:1 on white and passed every review, because a
  // screenshot cannot show you a contrast ratio and a token test cannot see
  // an alpha that lives in a call site. Seven sites carried it at once.
  //
  // Recede with `text-secondary-text-muted` (a measured token the test above
  // polices), or with a fill change. Never with `/NN` on a text colour.
  // Fills are NOT covered: `bg-error/10` is the Alert Tint and is correct.
  const ALPHA_TEXT =
    /\btext-(?:primary|on-primary|primary-text|secondary-text|error|success|warning|info)(?:-mark|-muted)?\/\d+\b/g;
  const offenders: string[] = [];
  for (const file of [...sourceFiles("components"), ...sourceFiles("app")]) {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const m of src.matchAll(ALPHA_TEXT)) {
      offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `text colours dimmed by alpha (unmeasurable, and below 4.5:1):\n${offenders.join("\n")}`,
  );
});

// ------------------------------------------------------------------ the mirror

test("themes/tokens.ts mirrors global.css exactly", () => {
  // The file says "keep the two in sync"; this is what keeps them in sync.
  const pairs: Array<[string, string]> = [
    ["primary", token(css, "primary")],
    ["primaryMark", token(css, "primary-mark")],
    ["primaryHover", token(css, "primary-hover")],
    ["primaryPressed", token(css, "primary-pressed")],
    ["onPrimary", token(css, "on-primary")],
    ["error", token(css, "error")],
    ["errorMark", token(css, "error-mark")],
    ["surface1", token(css, "surface-1")],    ["surface2", token(css, "surface-2")],
    ["surface3", token(css, "surface-3")],
    ["base", token(css, "base")],
    ["border", token(css, "border")],
    ["primaryText", token(css, "primary-text")],
    ["secondaryText", token(css, "secondary-text")],
    ["secondaryTextMuted", token(css, "secondary-text-muted")],
  ];
  const drift = pairs
    .map(([name, expected]) => ({ name, expected, actual: tsToken(ts, name) }))
    .filter((p) => p.expected.toLowerCase() !== p.actual.toLowerCase())
    .map((p) => `${p.name}: css ${p.expected} vs ts ${p.actual}`);
  assert.deepEqual(drift, [], `token drift — ${drift.join(", ")}`);
});
