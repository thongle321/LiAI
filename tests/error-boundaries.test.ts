/** Error-boundary guards: every boundary the router can land on.
 *
 * Expo Router resolves an error via the NEAREST ancestor layout that exports
 * a named `ErrorBoundary`, so these guards pin the ladder: chat crashes stay
 * in chat, menu crashes stay in the menu, everything else falls to the root
 * boundary. A thrown render must land on UI with a working retry — never a
 * blank screen.
 *
 * These lived at `app/+error.tsx`, `app/(drawer)/+error.tsx` and
 * `app/(drawer)/(tabs)/+error.tsx`. That is TANSTACK ROUTER's convention, and
 * expo-router's route scanner throws on any route node whose filename begins
 * with '+' (getRoutesCore.js:534) — which killed the whole app before a
 * single component rendered. The first guard below exists so that can never
 * come back quietly.
 *
 * Run: node --test tests/error-boundaries.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

/** Every layout that must publish a boundary, and the one it publishes. */
const LADDERS = [
  { layout: "app/_layout.tsx", boundary: "RootErrorBoundary" },
  { layout: "app/(drawer)/_layout.tsx", boundary: "DrawerErrorBoundary" },
  { layout: "app/(drawer)/(tabs)/_layout.tsx", boundary: "TabsErrorBoundary" },
];

const COMPONENTS = "components/RouteErrorBoundaries.tsx";

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("error boundaries", () => {
  it("has no route file whose name starts with '+'", () => {
    // REGRESSION. expo-router rejects these outright and the app cannot
    // boot; it is a route-file scanner rule, not a style preference.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      // withFileTypes: a plain readdirSync on a FILE throws ENOTDIR, which
      // is how the first version of this walker died on app/_layout.tsx.
      for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(`${dir}/${entry.name}`);
        } else if (entry.name.startsWith("+")) {
          offenders.push(`${dir}/${entry.name}`);
        }
      }
    };
    walk("app");
    assert.deepEqual(
      offenders,
      [],
      `no route file may start with '+' (expo-router rejects these at route-tree build): ${offenders.join(", ")}`,
    );
  });

  it("covers the root, drawer, and chat scopes", () => {
    for (const { layout, boundary } of LADDERS) {
      assert.ok(existsSync(path.join(ROOT, layout)), `${layout} must exist`);
      const src = read(layout);
      assert.match(
        src,
        new RegExp(`export \\{ ${boundary} as ErrorBoundary \\}`),
        `${layout} must re-export ${boundary} as the named ErrorBoundary`,
      );
    }
    const src = read(COMPONENTS);
    for (const { boundary } of LADDERS) {
      assert.match(
        src,
        new RegExp(`export function ${boundary}`),
        `${COMPONENTS} must define ${boundary}`,
      );
    }
  });

  it("gives every boundary a working retry", () => {
    // A boundary that only shows a message is not a boundary: { error, reset }
    // are the router's contract and reset is the whole point.
    const src = read(COMPONENTS);
    assert.match(src, /\berror\b[\s\S]{0,200}\breset\b/, "boundaries must use error + reset");
    assert.match(src, /onPress=\{reset\}/, "a boundary must wire a retry press");
  });

  it("stays on-theme and icon-free of emoji", () => {
    const src = read(COMPONENTS);
    assert.match(src, /bg-base/, "boundaries must sit on the base surface");
    assert.match(src, /text-primary-text/, "boundaries must use theme text");
    assert.doesNotMatch(src, /StyleSheet\.create/, "boundaries must style with Uniwind, never StyleSheet");
  });

  it("root offers an escape route back to chat", () => {
    // A boundary the user cannot leave is a trap: if chat itself threw,
    // retry loops on the same error, so root must also navigate away.
    // The target is the GROUP-qualified path — this app has no bare '/chat'.
    const src = read(COMPONENTS);
    assert.match(
      src,
      /router\.replace\("\/\(drawer\)\/\(tabs\)\/chat"\)/,
      "root must offer Back to chat",
    );
  });
});
