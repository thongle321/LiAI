/** Architecture conventions, enforced rather than documented.
 *
 * A doc that says "tests live in __tests__/" stops meaning anything the
 * first time someone adds a test next to the source. These four checks cost
 * one directory walk and catch the regressions that actually happen in this
 * codebase: a PascalCase component sneaking back in, a test landing outside
 * a __tests__ folder, a new `tests/` folder reappearing, or a file landing in
 * utils/ while importing a native module.
 *
 * The rules themselves and the reasoning for each divergence live in
 * docs/architecture-divergences.md.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SOURCE_DIRS = ["app", "components", "services", "utils", "store", "hooks", "types", "themes", "constants"];

/** Only the directories that exist: a deleted folder should shrink this
 *  file's coverage, not throw inside it. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = SOURCE_DIRS.filter((dir) => existsSync(join(ROOT, dir))).flatMap((dir) =>
  walk(join(ROOT, dir)),
);
const relative = (file: string) => file.slice(ROOT.length + 1).split("\\").join("/");

describe("architecture conventions", () => {
  it("keeps component filenames kebab-case, platform suffix included", () => {
    const offenders = walk(join(ROOT, "components"))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      // PascalCase in the stem, ignoring a .ios/.android/.web/.native variant.
      .filter((f) => {
        const stem = f.split(".").slice(0, -1).join(".");
        return /[A-Z]/.test(stem.replace(/^.*[\\/]/, ""));
      })
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("keeps every test in a __tests__ folder, never beside its subject", () => {
    const strays = files
      .filter((f) => /\.test\.[jt]sx?$/.test(f))
      .filter((f) => !relative(f).includes("__tests__/"));
    expect(strays.map(relative)).toEqual([]);
  });

  it("keeps the harness in jest/, not tests/", () => {
    // tests/ held harness files before the merge into jest/. Its return means
    // two homes for the same thing, and only one of them is wired into
    // jest.config.js and the typecheck script. Checked by CONTENTS, not by
    // existence: an empty directory is invisible to git and harmless.
    const stray = existsSync(join(ROOT, "tests"))
      ? readdirSync(join(ROOT, "tests")).filter((name) => !name.startsWith("."))
      : [];
    expect(stray).toEqual([]);
  });

  it("keeps utils/ free of device imports", () => {
    // The services/ vs utils/ split is only meaningful if utils/ is pure:
    // a file that reaches a device API belongs in services/. Reanimated is
    // the one exemption — it is a rendering library, and motion.ts is
    // presentation config (the app's one duration/easing), not a device
    // service. Named here rather than loosened into the pattern so the
    // exception stays visible.
    const NATIVE =
      /from\s+"(expo-|@react-native\/|llama\.rn|@kesha|@dr\.pogodin|@lodev09|tinybase|react-native-)/;
    const EXEMPT = new Set(["utils/motion.ts"]);
    const offenders = walk(join(ROOT, "utils"))
      .filter((f) => /\.tsx?$/.test(f))
      .map(relative)
      .filter((f) => !EXEMPT.has(f))
      .filter((f) => NATIVE.test(readFileSync(join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});