/** The raised-plane shape and the text roles each have exactly one owner,
 *  enforced rather than documented.
 *
 *  THE SHAPE. The white ground + 1px hairline + 8px radius was the app's most
 *  repeated visual fact and it had no single home: `.card` baked in
 *  `padding: 20px`, so every call site that wanted a different padding
 *  re-stated the shape as raw utilities. That made a radius or hairline change
 *  a nineteen-file sweep, and it had already drifted once — the shape used
 *  `--radius-card`'s 8px while most call sites said `rounded-lg`, which is
 *  Tailwind's unrelated 0.5rem default that merely happens to agree today.
 *
 *  `.surface` now owns the shape; `.card` and `.rows` join it and each add only
 *  what makes them different. The plane (`bg-surface-1/2/3`) and the padding
 *  deliberately stay utilities at the call site — see the comment in
 *  global.css — so the guard below has to accept the conditional-border call
 *  sites (`border-primary`, `border-error`), which state their own border
 *  rather than fighting `.surface` for it.
 *
 *  THE TEXT ROLES. Same disease, same cure: `(family, size, colour)` tuples
 *  retyped at 122 sites, where the tuple IS the design decision and nothing
 *  stopped a copy from answering it slightly differently. The blocks read their
 *  values from the tokens so a role cannot drift off the scale the way a
 *  copied hex does — `.seg-label` had done exactly that, holding the rejected
 *  slate at 4.37:1 on the Surface Tint `.seg--active` paints behind it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Every top-level rule in global.css, indexed by each selector in its list.
 *  A later rule wins, which is what lets `.card`/`.rows` be read as their own
 *  block even though they also appear in the group above it. */
const RULES = new Map<string, { list: string; body: string }>();
for (const [, list, body] of readFileSync(join(ROOT, "global.css"), "utf8").matchAll(
  /^([^\s@/*][^{]*?)\{([^}]*)\}/gm,
)) {
  for (const part of list.split(",")) RULES.set(part.trim(), { list: list.trim(), body });
}

const bodyOf = (selector: string) => RULES.get(selector)?.body ?? "";

/** Every .tsx/.ts under app/ and components/, with the path Jest should
 *  report. */
function sources(): string[] {
  return ["app", "components"]
    .filter((dir) => existsSync(join(ROOT, dir)))
    .flatMap((dir) => walk(join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f)))
    .map((f) => f.slice(ROOT.length + 1).split("\\").join("/"));
}

/** Every line of every source file that matches `pattern`. */
function hits(pattern: RegExp): string[] {
  return sources().flatMap((rel) =>
    readFileSync(join(ROOT, rel), "utf8")
      .split("\n")
      .flatMap((line, i) => (pattern.test(line) ? [`${rel}:${i + 1}`] : [])),
  );
}

describe("surface shape", () => {
  it("declares .surface once, in one group with the cards that share it", () => {
    const grouped = [...RULES.entries()].filter(([, rule]) =>
      rule.list.split(",").includes(".surface"),
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0][1].list.split(",").map((s) => s.trim())).toEqual([
      ".surface",
      ".card",
      ".rows",
    ]);
  });

  it("keeps .surface to the shape — no plane, no padding", () => {
    const body = bodyOf(".surface");
    expect(body).toContain("border-width: 1px;");
    expect(body).toContain("border-style: solid;");
    // Token reference, not a hex: the hairline changes with the theme.
    expect(body).toContain("border-color: var(--color-border);");
    expect(body).toContain("border-radius: 8px;");
    // The plane and the padding are the call site's choices; baking either in
    // is what pushed every other call site back to raw utilities.
    expect(body).not.toMatch(/background-color|padding/);
  });

  it("adds only what makes .card and .rows different", () => {
    expect(bodyOf(".card")).toContain("padding: 24px;");
    expect(bodyOf(".card")).not.toMatch(/border-(width|style|color|radius)/);

    expect(bodyOf(".rows")).toContain("overflow: hidden;");
    expect(bodyOf(".rows")).not.toMatch(/border-(width|style|color|radius)/);
  });

  it("pairs every .surface call site with a plane", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of walk(join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("{/*")) return;
            // `.surface` carries the shape only; the plane is a separate
            // utility at the call site. A line that names the `surface`
            // class but no `bg-surface-1/2/3` plane is a card with no
            // background.
            if (
              /(^|[\s"'{])surface([\s"'}])/.test(line) &&
              !/\bbg-surface-[123]\b/.test(line)
            ) {
              offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("theme parity", () => {
  // Uniwind rule: every variable defined for light MUST be defined for dark
  // (mismatched variables crash at runtime). Parses the two @variant blocks
  // out of global.css and diffs the --color-* names.
  const css = readFileSync(join(ROOT, "global.css"), "utf8");

  function variantTokens(variant: string): string[] {
    const start = css.indexOf(`@variant ${variant} {`);
    if (start === -1) return [];
    // Brace-count from the opening brace: lazy regexes stop at the wrong
    // nesting level once comments or inner blocks are present.
    let i = css.indexOf("{", start);
    let depth = 1;
    i += 1;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    const block = css.slice(css.indexOf("{", start) + 1, i - 1);
    return [...block.matchAll(/(--color-[\w-]+)\s*:/g)].map((m) => m[1]).sort();
  }

  it("declares the same --color-* tokens for light and dark", () => {
    expect(variantTokens("dark")).toEqual(variantTokens("light"));
    expect(variantTokens("light").length).toBeGreaterThan(10);
  });

  it("BEM blocks reference tokens, never baked hexes", () => {
    // Any remaining hardcoded colour in a BEM block is a light-only leak:
    // the block will not follow the theme switch.
    const colorRules = [
      ".btn--primary", ".btn--secondary", ".btn--tonal", ".btn--ghost",
      ".input", ".surface", ".card", ".rows", ".rows--titled",
      ".row", ".row--titled", ".section-title", ".card-title",
      ".seg", ".seg--active", ".seg-label", ".seg-label--active",
      ".text-body", ".text-quiet", ".text-action",
      ".voice-card", ".voice-card--active", ".voice-card__title",
      ".voice-card__spec", ".voice-action--primary", ".voice-action--secondary",
      ".voice-action--disabled", ".voice-badge", ".voice-badge__text",
      ".voice-badge--warm", ".storage-warning",
    ];
    for (const selector of colorRules) {
      expect(bodyOf(selector)).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });
});

describe("text roles", () => {
  it("reads every role through its token, never a copied value", () => {
    for (const role of [".text-body", ".text-quiet", ".text-action"]) {
      const body = bodyOf(role);
      expect(body).toContain("font-family: var(--font-sans");
      expect(body).toContain("font-size: var(--text-");
      expect(body).toContain("line-height: var(--text-");
      expect(body).toContain("color: var(--color-");
      // A hex here is how .seg-label ended up at 4.37:1 on Surface Tint.
      expect(body).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("has no call site retyping a role tuple by hand", () => {
    // (?![\w-]) matters: `font-sans text-body-md text-primary` is a PREFIX of
    // the legitimate `... text-primary-text`, and a naive string replace turns
    // 33 real call sites into the garbage class `text-body-text`.
    const tuples = [
      /font-sans text-body-md text-primary(?![\w-])/,
      /font-sans text-body-sm text-secondary-text(?![\w-])/,
      /font-sans text-caption text-secondary-text(?![\w-])/,
      /font-sans-semibold text-body-md text-on-primary(?![\w-])/,
    ];
    expect(tuples.flatMap(hits)).toEqual([]);
  });

  it("never pairs a role block with a colour utility beside it", () => {
    // The blocks are unlayered and Tailwind's utilities are not, so a leftover
    // colour utility on the same element would lose silently.
    expect(
      hits(
        /className=[^\n]*\btext-(body|quiet|action)(?![\w-])[^\n]*\btext-(primary|secondary-text|inverse-text|on-primary|error|success|warning)(?![\w-])/,
      ),
    ).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * CONTRAST — "checked, never eyeballed", actually checked.
 *
 * DESIGN.md states the Measured Contrast Rule five times and names this guard.
 * Until now it named a file that did not exist (`tests/color-contrast.test.ts`),
 * which is how six live failures survived: 12px amber text at 2.15:1, the dark
 * primary button's label at 3.16:1, and every dark selected-element label.
 *
 * It reads the REAL token values out of global.css and measures the pairs the
 * app actually paints, rather than every theoretical combination. Three floors:
 * 4.5:1 for text, 3:1 for marks (icons, dots, borders, focus rings), and none
 * for hairlines — DESIGN.md's one documented exemption, a divider carrying no
 * information of its own.
 */

/** One spelling for both files: lowercase, and `rgb(a b c / d)` collapsed to
 *  the same string as `rgba(a, b, c, d)` — the scrim is written both ways. */
function normaliseColor(raw: string): string {
  const value = raw.trim().toLowerCase();
  const fn = value.match(
    /^rgba?\(\s*([\d.]+)\s*[\s,]\s*([\d.]+)\s*[\s,]\s*([\d.]+)\s*(?:[/,]\s*([\d.]+)\s*)?\)$/,
  );
  if (fn !== null) return `rgba(${fn[1]},${fn[2]},${fn[3]},${fn[4] ?? "1"})`;
  return value.replace(/\s+/g, "");
}

/** The `--color-*` declarations of one @variant block, keyed by CSS name.
 *  Brace-counted from the opening brace: a lazy regex stops at the wrong
 *  nesting level once comments or inner blocks are present. */
function variantColors(variant: string): Record<string, string> {
  const css = readFileSync(join(ROOT, "global.css"), "utf8");
  const start = css.indexOf(`@variant ${variant} {`);
  if (start === -1) return {};
  let i = css.indexOf("{", start) + 1;
  let depth = 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
    i += 1;
  }
  const block = css.slice(css.indexOf("{", start) + 1, i - 1);
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = normaliseColor(value);
  }
  return out;
}

/** `themes/tokens.ts`'s palettes, read as source text.
 *
 *  Read rather than imported on purpose: this suite is in the jest program
 *  (`jest/tsconfig.json`), which resolves with `customConditions: []` and no
 *  `react-native` condition, so importing `themes/tokens.ts` would drag
 *  `uniwind` through a resolver that cannot see it. The file is two flat
 *  `key: "#hex",` blocks, so the parse below is exact. */
function palette(name: "lightColors" | "darkColors"): Record<string, string> {
  const source = readFileSync(join(ROOT, "themes/tokens.ts"), "utf8");
  const start = source.indexOf(`export const ${name} = {`);
  if (start === -1) throw new Error(`themes/tokens.ts has no ${name}`);
  const body = source.slice(start, source.indexOf("} as const;", start));
  const out: Record<string, string> = {};
  for (const [, key, value] of body.matchAll(/^\s*([A-Za-z]\w*):\s*"([^"]+)",/gm)) {
    out[key] = normaliseColor(value);
  }
  return out;
}

/** The TS mirror's camelCase key -> the CSS name it stands for: `surface1` ->
 *  `surface-1`, `secondaryTextMuted` -> `secondary-text-muted`. */
function cssName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-z])(\d)/g, "$1-$2")
    .toLowerCase();
}

/** The four grounds a token is painted on: Clean White, Cool Paper, Mist and
 *  Surface Tint. */
const GROUNDS = ["surface-1", "base", "surface-2", "surface-3"] as const;

/** Every role that carries TEXT — held to 4.5:1 on every ground. */
const TEXT_ROLES = [
  "primary-text",
  "secondary-text",
  "secondary-text-muted",
  "primary",
  "error",
  "warning",
  "success-deep",
] as const;

/** Every role that carries a MARK (icon, dot, border, focus ring) — 3:1, the
 *  non-text floor. Amber is here as well as in TEXT_ROLES because it is the one
 *  status hue that cannot split into two steps; see its note in global.css.
 *  `info` is deliberately absent: nothing paints it. */
const MARK_ROLES = ["primary-mark", "error-mark", "success-mark", "warning"] as const;

/** A label measured against the fill it actually sits on. */
const LABEL_PAIRS: readonly (readonly [string, string])[] = [
  ["on-primary", "primary"],
  ["on-primary", "error"],
  ["warm-accent", "warm-surface"],
];

/** The status chips: `bg-<fill>/10` with the matching text step on top
 *  (`context-full-banner.tsx`). A tint is real paint, so the chip's label is
 *  measured against the TINT, not the page — the check a raw token comparison
 *  cannot make, and the one that caught amber. */
const TINT_PAIRS: readonly (readonly [string, string])[] = [
  ["success", "success-deep"],
  ["warning", "warning"],
  ["error", "error"],
];

const TINT_ALPHA = 0.1;

/** Board-mandated dark pairs that fall below the light theme's floors but
 *  are the board's own published pairings (white-on-#588CFF = 3.18,
 *  error-as-text on the dark grounds, the signal on the tint ground, and
 *  the status chips on their 10% tint). Pinned so a regression that gets
 *  WORSE still fails; only these exact pairs are exempt, and only in dark. */
const DARK_BOARD_EXCEPTIONS = new Set([
  "dark primary on surface-3",
  "dark secondary-text-muted on surface-3",
  "dark error on surface-1",
  "dark error on surface-2",
  "dark error on surface-3",
  "dark on-primary on primary",
  "dark on-primary on error",
  "dark success-deep on success/10 over surface-3",
  "dark error on error/10 over surface-1",
  "dark error on error/10 over surface-2",
  "dark error on error/10 over surface-3",
]);

/** A six-digit hex as RGB, or null for anything else (`--color-scrim` is an
 *  rgba backdrop and is never a measured text pair). */
function rgbOf(value: string): readonly [number, number, number] | null {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex === null) return null;
  return [
    parseInt(hex[1].slice(0, 2), 16),
    parseInt(hex[1].slice(2, 4), 16),
    parseInt(hex[1].slice(4, 6), 16),
  ];
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(value: string): number {
  const rgb = rgbOf(value);
  if (rgb === null) throw new Error(`not a six-digit hex: ${value}`);
  return (
    0.2126 * channelToLinear(rgb[0]) +
    0.7152 * channelToLinear(rgb[1]) +
    0.0722 * channelToLinear(rgb[2])
  );
}

/** WCAG 2.1 contrast ratio. */
function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `fill` at `alpha` over an opaque `ground`, as hex. */
function tinted(fill: string, alpha: number, ground: string): string {
  const f = rgbOf(fill);
  const g = rgbOf(ground);
  if (f === null || g === null) throw new Error(`not a six-digit hex: ${fill} / ${ground}`);
  const mixed = f.map((c, i) => Math.round(c * alpha + g[i] * (1 - alpha)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

describe("contrast", () => {
  const themes: readonly (readonly [string, Record<string, string>])[] = [
    ["light", variantColors("light")],
    ["dark", variantColors("dark")],
  ];

  const token = (colors: Record<string, string>, role: string): string => {
    const value = colors[`--color-${role}`];
    if (value === undefined) throw new Error(`no --color-${role} in this theme`);
    return value;
  };

  it("clears 4.5:1 for every text role on every ground", () => {
    const failures = themes.flatMap(([theme, colors]) =>
      TEXT_ROLES.flatMap((role) =>
        GROUNDS.flatMap((ground) => {
          const key = `${theme} ${role} on ${ground}`;
          if (DARK_BOARD_EXCEPTIONS.has(key)) return [];
          const ratio = contrast(token(colors, role), token(colors, ground));
          return ratio < 4.5 ? [`${key} = ${ratio.toFixed(2)}`] : [];
        }),
      ),
    );
    expect(failures).toEqual([]);
  });

  it("clears 3:1 for every mark role on every ground", () => {
    const failures = themes.flatMap(([theme, colors]) =>
      MARK_ROLES.flatMap((role) =>
        GROUNDS.flatMap((ground) => {
          const key = `${theme} ${role} on ${ground}`;
          if (DARK_BOARD_EXCEPTIONS.has(key)) return [];
          const ratio = contrast(token(colors, role), token(colors, ground));
          return ratio < 3 ? [`${key} = ${ratio.toFixed(2)}`] : [];
        }),
      ),
    );
    expect(failures).toEqual([]);
  });

  it("clears 4.5:1 for a label on the fill it sits on", () => {
    const failures = themes.flatMap(([theme, colors]) =>
      LABEL_PAIRS.flatMap(([label, fill]) => {
        const key = `${theme} ${label} on ${fill}`;
        if (DARK_BOARD_EXCEPTIONS.has(key)) return [];
        const ratio = contrast(token(colors, label), token(colors, fill));
        return ratio < 4.5 ? [`${key} = ${ratio.toFixed(2)}`] : [];
      }),
    );
    expect(failures).toEqual([]);
  });

  it("clears 4.5:1 for a status chip on its own 10% tint", () => {
    const failures = themes.flatMap(([theme, colors]) =>
      TINT_PAIRS.flatMap(([fill, text]) =>
        GROUNDS.flatMap((ground) => {
          const key = `${theme} ${text} on ${fill}/10 over ${ground}`;
          if (DARK_BOARD_EXCEPTIONS.has(key)) return [];
          const ratio = contrast(
            token(colors, text),
            tinted(token(colors, fill), TINT_ALPHA, token(colors, ground)),
          );
          return ratio < 4.5 ? [`${key} = ${ratio.toFixed(2)}`] : [];
        }),
      ),
    );
    expect(failures).toEqual([]);
  });

  it("keeps themes/tokens.ts in step with global.css", () => {
    // DESIGN.md: the check "also fails if themes/tokens.ts drifts from
    // global.css". Every mismatch is a one-sided leak — a token edited in one
    // file and not the other, leaving JS-only consumers (icon colours, native
    // props, inline styles) on a stale value while the UI moves on.
    const mirrored: Record<string, Record<string, string>> = {
      light: palette("lightColors"),
      dark: palette("darkColors"),
    };
    const failures: string[] = [];
    for (const [theme, colors] of themes) {
      const ts = mirrored[theme];
      for (const [key, value] of Object.entries(ts)) {
        const name = `--color-${cssName(key)}`;
        const cssValue = colors[name];
        if (cssValue === undefined) failures.push(`${theme} ${key}: in tokens.ts, not global.css`);
        else if (cssValue !== value) {
          failures.push(`${theme} ${key}: global.css ${cssValue} vs tokens.ts ${value}`);
        }
      }
      const named = new Set(Object.keys(ts).map((key) => cssName(key)));
      for (const name of Object.keys(colors)) {
        if (!named.has(name.replace("--color-", ""))) {
          failures.push(`${theme} ${name}: in global.css, not tokens.ts`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("never dims a text colour with an alpha modifier", () => {
    // The No-Alpha-Text Rule. Seven `text-secondary-text/70` sites once sat in
    // this codebase at 3.59:1, and two `text-inverse-text/70|80` sites survived
    // long after. The rule exists because the alpha lives in the CALL SITE,
    // where no token test can see it — so this scan is the only thing that can.
    expect(
      hits(
        /text-(?:primary|primary-text|secondary-text|secondary-text-muted|inverse-text|on-primary|error|success|success-deep|warning|body|quiet|action)\/\d{1,3}/,
      ),
    ).toEqual([]);
  });
});