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
      files.push({
        file: file.replace(/\\/g, "/"),
        source: readFileSync(file, "utf8"),
      });
    }
  }
  return files;
}

/** Comments quote the anti-patterns on purpose ("this used to be
 * iOS-only..."), so every assertion below must run against CODE, not prose.
 * A "//" preceded by ":" is a URL, not a comment. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Matches a behaviour prop whose value is chosen by platform. */
const CONDITIONAL_BEHAVIOR =
  /behavior=\{[^}]*Platform\.OS\s*===\s*"ios"[^}]*\}/;

describe("keyboard avoidance", () => {
  it("never disables avoidance on Android with a platform-conditional behavior", () => {
    const offenders: string[] = [];
    for (const { file, source } of allSources()) {
      if (CONDITIONAL_BEHAVIOR.test(stripComments(source))) {
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
      const lines = stripComments(source).split("\n");
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

  it("the chat composer is carried by the chat architecture, not a KAV", () => {
    // The invariant is "the composer is never under the keyboard, and
    // everything floating above it moves with it". The mechanism is the
    // library's chat components plus ONE reconciled occlusion value: the
    // guide names four ways KeyboardAvoidingView falls short on chat, and
    // two parts translating independently is what made the empty state look
    // like it was sinking when the keyboard opened.
    const chat = stripComments(readFileSync("components/chat/ChatScreen.tsx", "utf8"));
    const list = stripComments(readFileSync("components/chat/MessageList.tsx", "utf8"));

    assert.doesNotMatch(chat, /KeyboardAvoidingView/, "chat must not use a KAV");
    assert.match(list, /KeyboardChatScrollView/, "the list needs the chat scroll view");
    // One shared value, derived through the tested helper - never a raw read
    // of keyboard.height, whose sign differs per platform.
    assert.match(chat, /keyboardOcclusion\(keyboard\.height\.value/);
    assert.match(chat, /translateY: -occlusion\.value/);
    assert.doesNotMatch(chat, /translateY: -height\.value/);
    // The empty placeholder must take the PADDED path. Translating a stack
    // that holds a centred flex-1 child pushes the icon out of its own box
    // and under the header as the keyboard rises; padding shrinks the box so
    // the child centres in the visible area.
    assert.match(
      chat,
      /showPlaceholder \? paddedStackStyle : liftedStackStyle/,
      "the centred empty state must be padded, not translated",
    );
    // Both offsets are what keep content off the composer and the tab bar.
    assert.match(list, /offset=\{offset\}/);
    assert.match(list, /extraContentPadding=\{extraContentPadding\}/);
  });

  it("every screen that reads keyboard height goes through the shared helper", () => {
    // pocketpal-ai's ChatView states the rule this enforces: one reconciled
    // value, so the parts "never disagree". Reading keyboard.height raw
    // reintroduces the per-platform sign bug, and two screens computing it
    // differently is what made the layout look like it was drifting.
    const offenders: string[] = [];
    for (const { file, source } of allSources()) {
      const code = stripComments(source);
      if (!/keyboard\.height/.test(code)) continue;
      if (!/keyboardOcclusion\(/.test(code)) {
        offenders.push(`${file}: reads keyboard.height without keyboardOcclusion()`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("the composer does not re-apply the bottom inset the tab bar owns", () => {
    // app/(drawer)/(tabs)/_layout.tsx applies paddingBottom: insets.bottom
    // to the bar itself, and the screens deliberately use
    // edges=[top,left,right] so the inset is applied ONCE, there. A second
    // application inside the composer stack is dead space under the input.
    const offenders: string[] = [];
    for (const file of [
      "components/chat/ChatScreen.tsx",
      "app/(drawer)/(tabs)/voice.tsx",
    ]) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const m of code.matchAll(/paddingBottom:[^,}]*insets\.bottom/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("the composer is measured on its wrapper, not on the field row", () => {
    // extraContentPadding is how the list reserves room for the composer.
    // Measuring only the field row under-reserves by the wrapper's border-t
    // and pt-2, the field's mb-3, and the attach preview and issue rows - the
    // last message can then sit behind them. pocketpal-ai measures the whole
    // input container for the same reason (ChatView.tsx:1139).
    const source = stripComments(
      readFileSync("components/chat/ChatInput.tsx", "utf8"),
    );
    const measured = source
      .split("<View")
      .find((tag) => tag.includes("onLayout={onHeightChange}"));
    assert.ok(measured, "onHeightChange must still be wired somewhere");
    assert.match(
      measured,
      /border-t/,
      "measure the composer WRAPPER, which holds the banners and attach preview",
    );
    assert.doesNotMatch(
      measured,
      /px-4 py-3/,
      "the field row is not the composer: it excludes the wrapper and banners",
    );
  });

  it("the shared helper is callable from the UI runtime", () => {
    // keyboardOcclusion is called INSIDE useDerivedValue, which runs on the
    // UI runtime. A plain JS function there throws at runtime:
    // "[Worklets] Tried to synchronously call a Remote Function". Node tests
    // cannot catch that - the directive is a no-op there - so it is asserted
    // statically. Pure was not enough; worklet-compatible is a separate
    // property from being pure.
    const helper = readFileSync("lib/keyboard.ts", "utf8");
    const body = helper.slice(helper.indexOf("export function keyboardOcclusion"));
    assert.match(
      body.slice(0, body.indexOf("}")),
      /["']worklet["']/,
      "keyboardOcclusion needs the 'worklet' directive: it runs on the UI thread",
    );
  });
});
