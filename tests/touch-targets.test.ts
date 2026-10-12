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
  // The ON-DEVICE model store at the repo root, not a source directory.
  // Matched by absolute path: an entry-name check (`entry === "models"`)
  // also skipped components/models/, which is 17 files of UI — the whole
  // models screen was invisible to this guard.
  const modelStore = path.join(ROOT, "models");
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    if (entry === "node_modules" || entry === "pocketpal-ai") continue;
    const full = path.join(dir, entry);
    if (path.resolve(full) === path.resolve(modelStore)) continue;
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
    const offenders = pressables(
      (classes) => classes.match(/\b(?:min-)?h-(?:10|11)\b/)?.[0] ?? null,
    );
    assert.deepEqual(offenders, [], `sub-${MIN_TARGET_DP}dp pressables:\n${offenders.join("\n")}`);
  });

  it("the bare text links and filter chips declare a floor", () => {
    // A pressable with no min-h- and no padding — a text link, a filter chip
    // — renders at its text height: ~20px, ~28px. Four of those shipped in
    // the models cluster.
    //
    // NOT a blanket rule, and deliberately so. "No height declared" reads as
    // a defect everywhere, but it is only one when nothing supplies the
    // height: a Pressable inside a `.row` (min-height 48) or a flex parent
    // inherits a floor this scan cannot see, and generalising the check
    // flagged ~160 sites across a codebase whose floor is otherwise held by
    // the BEM blocks. So the real cases are pinned by name instead, and a
    // blanket check waits until something can resolve parent height.
    const pinned: Array<[string, string]> = [
      ["components/models/ModelCardDetails.tsx", "View on Hugging Face"],
      ["components/models/DownloadErrorDialog.tsx", "View on Hugging Face"],
      // Anchored on the onPress PROP, not the bare name: the prop is also
      // destructured at the top of the file, and indexOf would find that
      // occurrence instead of the one inside the Pressable tag.
      ["components/models/HFSearchView.tsx", "onPress={onOpenAuthor}"],
      ["components/models/HFSearchView.tsx", "onPress={onOpenSort}"],
    ];
    const missing: string[] = [];
    for (const [file, anchor] of pinned) {
      const src = readFileSync(path.join(ROOT, file), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      const at = src.indexOf(anchor);
      assert.ok(at >= 0, `anchor not found: ${file} — ${anchor}`);
      const tag = src.slice(src.lastIndexOf("<Pressable", at), src.indexOf(">", at));
      // Tailwind's 4px scale spells 48dp as `h-12` / `min-h-12` (12 x 4),
      // NOT `min-h-48` — the number in the class is the scale step.
      if (!/\b(?:min-)?h-12\b/.test(tag)) {
        missing.push(`${file}: ${anchor}`);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `these pressables declare no ${MIN_TARGET_DP}dp floor:\n${missing.join("\n")}`,
    );
  });
});

/** Read one element's className, whichever spelling it uses.
 *
 *  All three matter, and each one has hidden a regression: `"…"`, `` `…` ``,
 *  and `{…}` — where the braces hold a MULTI-LINE ternary
 *  (`className={disabled ? "a" : "b"}`). A regex for the last needs balanced
 *  brace counting, because the strings inside it contain braces of their own
 *  in the template-literal case, and the value can span lines. */
function classNameOf(src: string, at: number): string | null {
  const eq = src.indexOf("=", at) + 1;
  if (eq === 0) return null;
  let i = eq;
  while (i < src.length && /\s/.test(src[i]!)) i += 1;
  const open = src[i];
  if (open === '"' || open === "`") {
    const end = src.indexOf(open, i + 1);
    return end === -1 ? null : src.slice(i + 1, end);
  }
  if (open !== "{") return null;
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === "{") depth += 1;
    else if (src[j] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(i + 1, j);
    }
  }
  return null;
}

/** Every pressable with an onPress, and the verdict `judge` gives its
 *  classes (a string to report, or null to pass). */
function pressables(judge: (classes: string) => string | null): string[] {
  const offenders: string[] = [];
  for (const file of [
    ...sourceFiles("components", [".tsx"]),
    ...sourceFiles("app", [".tsx"]),
  ]) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/<Pressable\b/g)) {
      const tag = src.slice(m.index, src.indexOf(">", m.index));
      if (!/onPress|onLongPress/.test(tag)) continue;
      const raw = classNameOf(src, m.index + "<Pressable".length);
      if (raw === null) continue;
      // A ternary's arms are quoted; take every literal so each arm counts.
      const classes = [...raw.matchAll(/["`]([^"`]*)["`]/g)]
        .map((a) => a[1]!)
        .join(" ");
      const verdict = judge(classes);
      if (verdict) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${path.relative(ROOT, file)}:${line}: ${verdict}`);
      }
    }
  }
  return offenders;
}
