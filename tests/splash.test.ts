/** Splash-screen coordination guards: the native splash must cover the
 * font load so cold start never flashes a blank frame.
 *
 * Run: node --test tests/splash.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("splash screen", () => {
  it("registers the config plugin", () => {
    const config = JSON.parse(read("app.json"));
    const plugins: unknown[] = config.expo.plugins;
    assert.ok(
      plugins.includes("expo-splash-screen"),
      "app.json must include the expo-splash-screen plugin",
    );
  });

  it("holds the splash until Inter resolves", () => {
    const src = read("app/_layout.tsx");
    assert.match(
      src,
      /preventAutoHideAsync\(\)/,
      "root layout must hold the native splash on launch",
    );
    // hideAsync must run on the loaded branch right after the font gate
    // (same render that first returns UI) — never in an effect.
    const gate = src.indexOf("if (!loaded) return null");
    assert.ok(gate >= 0, "root layout must still gate on fonts");
    const loadedBranch = src.indexOf("if (loaded && !splashHidden.current)");
    assert.ok(
      loadedBranch >= 0 && loadedBranch < gate,
      "hideAsync must sit on a once-guarded loaded branch before the font gate",
    );
    const hideCall = src.indexOf("SplashScreen.hideAsync()", loadedBranch);
    assert.ok(
      hideCall >= 0 && hideCall < gate,
      "hideAsync must run after the font gate, not in an effect",
    );
  });
});
