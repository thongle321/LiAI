/** The raised-plane shape has exactly one owner, enforced rather than
 *  documented.
 *
 *  The white ground + 1px hairline + 8px radius was the app's most repeated
 *  visual fact and it had no single home: `.card` baked in `padding: 20px`,
 *  so every call site that wanted a different padding re-stated the shape as
 *  raw utilities. That made a radius or hairline change a nineteen-file sweep,
 *  and it had already drifted once — the shape used `--radius-card`'s 8px
 *  while most call sites said `rounded-lg`, which is Tailwind's unrelated
 *  0.5rem default that merely happens to agree today.
 *
 *  `.surface` now owns the shape; `.card` and `.rows` join it and each add only
 *  what makes them different. The plane (`bg-surface-1/2/3`) and the padding
 *  deliberately stay utilities at the call site — see the comment in
 *  global.css — so the guard below has to accept the conditional-border call
 *  sites (`border-primary`, `border-error`), which state their own border
 *  rather than fighting `.surface` for it.
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

  it("has no call site re-stating the shape as raw utilities", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of walk(join(ROOT, dir)).filter((f) => /\.tsx?$/.test(f))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            // One line = one className. A line carrying the ground, the
            // hairline and the 8px radius together is a call site that
            // re-expresses what `.surface` now owns.
            if (
              /\bbg-surface-1\b/.test(line) &&
              /\bborder-border\b/.test(line) &&
              /\brounded-(lg|card)\b/.test(line)
            ) {
              offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});