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
    expect(body).toContain("border-color: #e2e8f0;");
    expect(body).toContain("border-radius: 8px;");
    // The plane and the padding are the call site's choices; baking either in
    // is what pushed every other call site back to raw utilities.
    expect(body).not.toMatch(/background-color|padding/);
  });

  it("adds only what makes .card and .rows different", () => {
    expect(bodyOf(".card")).toContain("padding: 20px;");
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