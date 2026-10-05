/** Error-boundary guards: every boundary the router can land on.
 *
 * Expo Router resolves an error via the NEAREST +error.tsx ancestor, so
 * these guards pin the ladder: chat crashes stay in chat, settings crashes
 * stay in settings, everything else falls to the root boundary. A thrown
 * render must land on UI with a working retry — never a blank screen.
 *
 * Run: node --test tests/error-boundaries.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("error boundaries", () => {
  it("covers the root, chat, and drawer scopes", () => {
    for (const file of [
      "app/+error.tsx",
      "app/(drawer)/(tabs)/+error.tsx",
      "app/(drawer)/+error.tsx",
    ]) {
      assert.ok(existsSync(path.join(ROOT, file)), `${file} must exist`);
      const src = read(file);
      assert.match(
        src,
        /export default function \w*ErrorScreen/,
        `${file} must default-export an ErrorScreen component`,
      );
      // Router error screens receive { error, reset }: the retry path is
      // the whole point, a message alone is not a boundary.
      assert.match(src, /\berror\b[\s\S]{0,200}\breset\b/, `${file} must use error + reset`);
      assert.match(src, /onPress=\{reset\}/, `${file} must wire a retry press`);
    }
  });

  it("stays on-theme and icon-free of emoji", () => {
    for (const file of [
      "app/+error.tsx",
      "app/(drawer)/(tabs)/+error.tsx",
      "app/(drawer)/+error.tsx",
    ]) {
      const src = read(file);
      assert.match(src, /bg-base/, `${file} must sit on the base surface`);
      assert.match(src, /text-primary-text/, `${file} must use theme text`);
      assert.doesNotMatch(
        src,
        /StyleSheet\.create/,
        `${file} must style with Uniwind, never StyleSheet`,
      );
    }
  });

  it("root offers an escape route back to chat", () => {
    // A boundary the user cannot leave is a trap: if chat itself threw,
    // retry loops on the same error, so root must also navigate away.
    const src = read("app/+error.tsx");
    assert.match(src, /router\.replace\("\/chat"\)/, "root must offer Back to chat");
  });
});
