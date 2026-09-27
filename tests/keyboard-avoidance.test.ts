/** Keyboard avoidance must exist on BOTH platforms.
 *
 * These are source scans, not runtime tests, because the failure they guard
 * is a configuration mistake rather than logic: the app is edge-to-edge on
 * Android (targetSdk 36, expo edgeToEdgeEnabled), so
 * softwareKeyboardLayoutMode "resize" no longer shrinks the window and the
 * app draws behind the keyboard. Anything that relies on the window
 * resizing provides no avoidance at all.
 *
 * The trap this file exists for: React Native's own KAV needed
 * behavior=undefined on Android because the window resized underneath it.
 * Adopting react-native-keyboard-controller and keeping that prop preserved
 * a mechanism that had already stopped working, and the chat composer sat
 * under the keyboard. Conditional avoidance is the bug; a source scan is
 * the only thing that catches it, because no node test can render a
 * keyboard.
 *
 * Run: node --test tests/keyboard-avoidance.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function allSources(): { file: string; source: string }[] {
  const files: { file: string; source: string }[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      files.push({ file: file.replace(/\\/g, "/"), source: readFileSync(file, "utf8") });
    }
  }
  return files;
}

/** Matches a behaviour prop whose value is chosen by platform. */
const CONDITIONAL_BEHAVIOR =
  /behavior=\{[^}]*Platform\.OS\s*===\s*"ios"[^}]*\}/;

describe("keyboard avoidance", () => {
  it("never disables avoidance on Android with a platform-conditional behavior", () => {
    const offenders: string[] = [];
    for (const { file, source } of allSources()) {
      if (CONDITIONAL_BEHAVIOR.test(source)) {
        offenders.push(
          `${file}: behavior is chosen by platform, so one platform gets no avoidance`,
        );
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("never gates a keyboard-height transform to iOS only", () => {
    // The window does not resize for the keyboard on edge-to-edge Android,
    // so a lift gated to iOS leaves Android with no avoidance at all.
    const offenders: string[] = [];
    for (const { file, source } of allSources()) {
      const lines = source.split("\n");
      lines.forEach((line, i) => {
        if (!/translateY/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 2), i + 2).join("\n");
        if (/Platform\.OS\s*===\s*"ios"/.test(context)) {
          offenders.push(`${file}:${i + 1}: translateY gated to iOS`);
        }
      });
    }
    assert.deepEqual(offenders, []);
  });

  it("the chat composer is wrapped in a keyboard-avoiding view", () => {
    const chat = readFileSync("components/chat/ChatScreen.tsx", "utf8");
    assert.match(chat, /KeyboardAvoidingView/);
    // padding on both platforms, and the offset must be explicit: the view
    // sits under a 56px header, so the library's default offset math (which
    // assumes the view starts at the screen top) would under-pad.
    assert.match(chat, /behavior="padding"/);
  });
});
