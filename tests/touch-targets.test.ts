/** Touch-target floor guard.
 *
 * Two rounds in a row shipped "all targets are 48dp" while `.btn` still
 * said 44px in global.css — the BEM source every bare call site inherits
 * from. Per-call-site sweeps keep missing it. This locks the source of
 * truth so the floor cannot silently drop again.
 *
 * A source scan, not a render test: the defect was a stylesheet value.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");
const MIN_TARGET_DP = 48;

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    if (entry === "node_modules" || entry === "pocketpal-ai") continue;
    // The on-device model store, not a source directory.
    if (entry === "models") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full, exts));
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

describe("touch target floor", () => {
  // The floor belongs in the BEM blocks every call site inherits, not in a
  // per-control class. .seg is 8+8 padding over a 14px label (~33px) and
  // .row is 12+12 padding over body text (~41px) — both were under 48.
  const BEM_BLOCKS = [".btn", ".btn--circle", ".seg", ".row", ".menu-row"];
  for (const block of BEM_BLOCKS) {
    it(`${block} meets the 48dp floor`, () => {
      const css = read("global.css");
      const start = css.indexOf(`${block} {`);
      const body = start === -1 ? "" : css.slice(start, css.indexOf("}", start));
      const px = Number(body.match(/(?:min-height|width|height):\s*(\d+)px/)?.[1] ?? 0);
      assert.ok(
        px >= MIN_TARGET_DP,
        `${block} resolves to ${px}px, below the ${MIN_TARGET_DP}dp floor`,
      );
    });
  }

  it("no source uses a sub-48 size class on a pressable", () => {
    // h-10/h-11/min-h-11 are the sizes this project has used to sit under
    // the floor. Match from <Pressable to its className rather than to the
    // tag's closing >: an onPress={() => ...} arrow contains that >, so a
    // tag-shaped match truncates before ever reading the className.
    const offenders: string[] = [];
    for (const file of [
      ...sourceFiles("components", [".tsx"]),
      ...sourceFiles("app", [".tsx"]),
    ]) {
      const src = readFileSync(file, "utf8");
      for (const [, before, classes] of src.matchAll(
        /<Pressable([\s\S]*?)className="([^"]*)"/g,
      )) {
        if (!/onPress|onLongPress/.test(before)) continue;
        const bad = classes.match(/\b(?:min-)?h-(?:10|11)\b/);
        if (bad) offenders.push(`${path.relative(ROOT, file)}: ${bad[0]}`);
      }
    }
    assert.deepEqual(offenders, [], `sub-${MIN_TARGET_DP}dp pressables:\n${offenders.join("\n")}`);
  });
});
