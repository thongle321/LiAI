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

const ROOTS = ["app", "components", "hooks"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      out.push(full);
    }
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

function read(file: string): string {
  return stripComments(readFileSync(file, "utf8"));
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
    // The invariant is "the composer is never under the keyboard, and the
    // content behind it does not move". The mechanism is the library's chat
    // components plus ONE reconciled lift: the guide names four ways
    // KeyboardAvoidingView falls short on chat, and two parts translating
    // independently is what made the empty state look like it was sinking.
    const chat = read("components/chat/ChatScreen.tsx");
    const list = read("components/chat/MessageList.tsx");

    assert.doesNotMatch(chat, /KeyboardAvoidingView/, "chat must not use a KAV");
    assert.match(list, /KeyboardChatScrollView/, "the list needs the chat scroll view");
    assert.match(list, /offset=\{offset\}/, "the list clears the tab bar");
    assert.match(
      list,
      /extraContentPadding=\{extraContentPadding\}/,
      "the list clears the composer",
    );

    // The empty state is CONTENT, so the keyboard covers it like anything
    // else instead of the screen re-centring behind the keyboard.
    assert.match(list, /ListEmptyComponent=\{emptyComponent\}/);
    assert.match(chat, /paddingBottom: composerHeight/);
  });

  it("the composer is the floating box, with no wrapper between it and the screen", () => {
    // A wrapper that only re-exports a transform is a second box that can
    // disagree with the one it wraps. That is not hypothetical: the previous
    // revision had ChatScreen's container lifting on one path and the centred
    // empty state padded on another, and the composer stopped rising in
    // exactly the empty-thread case. ChatInput is the box; ChatScreen only
    // says where it goes.
    const chat = read("components/chat/ChatScreen.tsx");
    const input = read("components/chat/ChatInput.tsx");

    assert.match(
      chat,
      /<ChatInput\s+className="absolute inset-x-0 bottom-0"/,
      "ChatScreen positions the floating composer",
    );
    assert.doesNotMatch(
      chat,
      /useAnimatedStyle\(/,
      "ChatScreen must not hand-roll a transform: lifts come from the hook",
    );
    assert.doesNotMatch(
      chat,
      /paddedStackStyle|liftedStackStyle/,
      "the translate/pad split must stay deleted",
    );
    assert.doesNotMatch(
      chat,
      /paddingBottom: occlusion/,
      "the composer is translated, never padded",
    );

    // The floating box is the one that lifts and the one that measures.
    assert.match(input, /style=\{lift\}/, "ChatInput carries its own lift");
    assert.match(input, /onLayout=\{onHeightChange\}/, "measured at the outermost level");
    assert.match(
      input,
      /px-5 pt-2\$\{className/,
      "the caller's classes merge onto the gutter-owning root",
    );
  });

  it("the composer rises by the FULL keyboard height, not height minus the inset", () => {
    // The actual bug. The composer is `absolute inset-x-0 bottom-0`, so its
    // bottom edge IS the bottom of the screen and it has to rise by
    // everything the keyboard takes. It was being passed insets.bottom while
    // anchored at 0, which under-lifted it by exactly the navigation bar
    // height — the reported "the chat input is not above the keyboard".
    const hook = read("hooks/useKeyboardLift.ts");
    const input = read("components/chat/ChatInput.tsx");

    assert.match(
      hook,
      /export function useKeyboardLift\(insetsBottom = 0\)/,
      "the anchor defaults to 0 so a bottom-anchored view cannot under-lift",
    );
    assert.match(
      input,
      /useKeyboardLift\(\)/,
      "the composer is anchored at the physical bottom, so it passes no inset",
    );
    // The lift must NEGATE. The library's height is already negative while
    // the keyboard is up, so `translateY: height.value` would move the view
    // DOWN by the keyboard height - the original "the panel sank" bug. The
    // helper makes that value positive, so the transform subtracts it.
    // Nothing else asserted this, which meant a regression back to
    // `translateY: keyboard.height.value` passed the entire suite.
    assert.match(
      hook,
      /translateY: -occlusion\.value/,
      "the lift must negate: the library's height is negative while up",
    );
    assert.doesNotMatch(
      hook,
      /translateY: keyboard\.height\.value/,
      "using the library's already-negative height directly would sink the view",
    );
    // The vision panel IS anchored above the nav bar, so it must still
    // subtract - that asymmetry is the whole point of the parameter.
    assert.match(read("components/VisionOverlays.tsx"), /useKeyboardLift\(bottom\)/);
  });

  it("exactly one file reads the keyboard height", () => {
    // pocketpal-ai's ChatView states the rule this enforces: one reconciled
    // value, so the parts "never disagree". Two screens computing it
    // differently is what made the layout look like it was drifting, and a
    // raw read reintroduces the sign bug.
    const readers = allSources()
      .filter(({ source }) => /keyboard\.height/.test(stripComments(source)))
      .map(({ file }) => file);
    assert.deepEqual(readers, ["hooks/useKeyboardLift.ts"]);
  });

  it("the composer does not re-apply the bottom inset the tab bar owns", () => {
    // app/(drawer)/(tabs)/_layout.tsx applies paddingBottom: insets.bottom
    // to the bar itself, and the screens deliberately use
    // edges=[top,left,right] so the inset is applied ONCE, there. A second
    // application inside the composer is dead space under the input.
    const offenders: string[] = [];
    for (const file of [
      "components/chat/ChatScreen.tsx",
      "components/chat/ChatInput.tsx",
      "app/(drawer)/(tabs)/voice.tsx",
    ]) {
      const code = read(file);
      for (const m of code.matchAll(/paddingBottom:[^,}]*insets\.bottom/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("the composer's banners do not stack a second gutter", () => {
    // The banners moved inside the composer's box, which owns the px-5. If
    // they keep their own, they sit at 40px against the field's 20px and the
    // misalignment is visible on every screen. DESIGN.md: "gutters are owned
    // by one layer". Scoped to the aboveField slot on purpose: the header and
    // the search bar sit outside the composer and own their own inset.
    const offenders: string[] = [];
    for (const file of [
      "components/chat/SuggestedPrompts.tsx",
      "components/chat/UsageStats.tsx",
    ]) {
      if (/px-5/.test(read(file))) offenders.push(`${file}: carries its own px-5`);
    }

    const chat = read("components/chat/ChatScreen.tsx");
    const start = chat.indexOf("aboveField={");
    assert.notEqual(start, -1, "the banners must arrive through the slot");
    const end = chat.indexOf("\n      />", start);
    // Without this the slice below runs to end-of-file on any reformat and
    // the whole test passes while checking nothing.
    assert.notEqual(end, -1, "could not find the end of the aboveField slot");
    const banners = chat.slice(start, end);
    for (const m of banners.matchAll(/className="[^"]*\bpx-5\b[^"]*"/g)) {
      offenders.push(`components/chat/ChatScreen.tsx banner: ${m[0]}`);
    }
    assert.deepEqual(offenders, []);
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
