/** Architecture conventions, enforced rather than documented.
 *
 * A doc that says "tests live in __tests__/" stops meaning anything the
 * first time someone adds a test next to the source. These checks cost one
 * directory walk and catch the regressions that actually happen in this
 * codebase: a PascalCase component sneaking back in, a test landing outside
 * a __tests__ folder, a test landing under `app/` at all, a new `tests/`
 * folder reappearing, a file landing in utils/ while importing a native
 * module, a cross-directory specifier climbing with `../` when `@/` exists,
 * or a platform-paired module imported by extension.
 *
 * The rules themselves and the reasoning for each divergence live in
 * docs/architecture-divergences.md.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

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

  it("keeps cross-directory imports on the @/ alias", () => {
    // tsconfig.json maps "@/*" to the repo root and Metro resolves it for free,
    // so `@/store/chat.ts` says outright what `../store/chat.ts` only implies:
    // the specifier is a promise about where THIS file lives, and only a move
    // can keep that promise.
    //
    // A `../` has to be RESOLVED, not pattern-matched. `../sheet.tsx` from
    // components/models/ is components/sheet.tsx — the same top-level
    // directory, and a genuine intra-feature sibling — while
    // `../themes/tokens.ts` from the same file leaves components/ entirely. The
    // old rule banned `../../` and so missed 110 of the 111 offenders: every
    // `hooks/*`, `store/*` and `components/*` file climbing one level to reach
    // another top-level directory passed. The line is the top-level directory,
    // so that is what this measures.
    //
    // Two exemptions, named rather than loosened into the pattern:
    //  - a `.css` side-effect import. jest.config.js maps `\.css$` to a style
    //    stub, but `^@/(.*)$` is listed FIRST, so `@/global.css` would resolve
    //    to the real file and hand Jest raw CSS.
    //  - a dynamic `import("...")`, because jest's CJS runtime does not route it
    //    through moduleNameMapper: an "@/" specifier there resolves on device
    //    and fails in tests.
    const offenders: string[] = [];
    for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
      const rel = relative(file);
      const top = rel.split("/")[0];
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/import\s*\(\s*"/.test(line)) return;
          const match = line.match(/from\s+"([^"]+)"|^\s*import\s+"([^"]+)"/);
          const requested = match?.[1] ?? match?.[2];
          if (requested === undefined || !requested.startsWith("../")) return;
          if (requested.endsWith(".css")) return;
          const resolved = posix.normalize(posix.join(posix.dirname(rel), requested));
          if (resolved.split("/")[0] !== top) offenders.push(`${rel}:${i + 1}  ${requested}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("imports a platform-paired module with no extension", () => {
    // Metro resolves `./picker-menu` to picker-menu.ios.tsx on iOS and
    // picker-menu.android.tsx on Android — but ONLY for an extension-less
    // specifier. `resolveSourceFileForAllExts` is called first with an empty
    // sourceExt, so the candidates for `./picker-menu.tsx` are
    // `picker-menu.tsx.ios` and then `picker-menu.tsx`: the second one exists,
    // it is the shared contract file, and that file renders null. The wrong
    // import therefore compiles, type-checks, ships, and silently removes the
    // control. Two call sites had done exactly that (chat-template-dialog's
    // template picker and generation-settings-sheet's reset menu), which is
    // why this is a guard and not a convention.
    //
    // Naming a variant outright (`../picker-menu.ios`) is the other half of
    // the same mistake: it pins one platform onto both.
    const paired = new Set<string>();
    for (const file of files.filter((f) => /\.(ios|android)\.tsx$/.test(f))) {
      const rel = relative(file);
      const dir = rel.slice(0, rel.lastIndexOf("/"));
      const stem = rel.slice(rel.lastIndexOf("/") + 1).replace(/\.(ios|android)\.tsx$/, "");
      paired.add(`${dir}/${stem}`);
    }
    expect(paired.size).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
      const rel = relative(file);
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const match = line.match(/from\s+"([^"]+)"|^\s*import\s+"([^"]+)"/);
          const requested = match?.[1] ?? match?.[2];
          if (requested === undefined) return;
          let resolved: string | null = null;
          if (requested.startsWith("@/")) resolved = requested.slice(2);
          else if (requested.startsWith(".")) resolved = posix.normalize(posix.join(dir, requested));
          if (resolved === null) return;
          for (const target of paired) {
            // Exactly the pair's name: correct, Metro supplies the variant.
            if (resolved === target) return;
            if (resolved.startsWith(`${target}.`)) {
              offenders.push(`${rel}:${i + 1}  ${requested}`);
              return;
            }
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps app/ to routes", () => {
    // Expo Router turns every recognised extension under app/ into a route.
    // Its Metro context is /^(?:\.\/)...\.[tj]sx?$/ with only +api, +html
    // and +middleware excluded, and `getRoutesCore`'s ignoreList has no
    // __tests__ entry — so a test file placed here IS a route, and it has no
    // default export to render. Nothing errors; the router just gains a
    // screen nobody should reach.
    //
    // The contract is written down in
    // .agents/skills/expo-router/references/route-structure.md:10 — "The app
    // directory should only contain route and _layout files; every file
    // should export a default component."
    //
    // Which is why the route-level suites (route-smoke, onboarding-gate,
    // onboarding-done) live in jest/ rather than beside the route they
    // exercise: this is the one place the "tests live in __tests__/ beside
    // their subject" rule cannot hold. This assertion is what stops the
    // tidier-looking alternative from being tried again.
    const appFiles = existsSync(join(ROOT, "app")) ? walk(join(ROOT, "app")) : [];
    const offenders = appFiles
      .map(relative)
      .filter((rel) => /(^|\/)(__tests__|__mocks__)\//.test(rel) || /\.(test|spec)\.[jt]sx?$/.test(rel));
    expect(offenders).toEqual([]);
  });
});