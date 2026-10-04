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
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    const list = read("components/chat/MessageList.tsx");

    assert.doesNotMatch(chat, /KeyboardAvoidingView/, "chat must not use a KAV");
    assert.match(list, /KeyboardChatScrollView/, "the list needs the chat scroll view");
    assert.match(list, /offset=\{offset\}/, "the list clears the tab bar");
    assert.match(
      list,
      /extraContentPadding=\{extraContentPadding\}/,
      "the list clears the composer",
    );

    // The empty state must NOT be scroll content. KeyboardChatScrollView adds
    // the keyboard height to the scroll viewport as a dynamic contentInset
    // (ScrollViewWithBottomPadding: `dynamic.bottom = bottomPadding.value`),
    // applied on Android on every keyboard open regardless of
    // keyboardLiftBehavior. A centred flex-1 ListEmptyComponent inside that
    // inset re-centres in the shrunken box, which is the reported "no models
    // available section moves when the keyboard shows up". So it is an
    // overlay beside the list, lifted clear of the floating composer by the
    // measured height.
    assert.doesNotMatch(
      list,
      /ListEmptyComponent/,
      "the empty state must not be scroll content: the keyboard inset moves it",
    );
    assert.match(chat, /showPlaceholder && \(/);
    assert.match(chat, /className="absolute inset-x-0 top-0"/);
    assert.match(
      chat,
      /bottom: composerHeight \+ tabBarCompensation/,
      "the column-anchored overlays must compensate for the tab bar hiding",
    );
  });

  it("column-anchored overlays compensate for the tab bar hiding", () => {
    // The custom tab bar returns null while the keyboard is up
    // (app/(drawer)/(tabs)/_layout.tsx:42), so the screen and this column grow
    // by the tab bar's height. A vertically centred child then slides DOWN by
    // half of it — which is what made the empty-state card look like it moved
    // when the keyboard opened, and it has nothing to do with the keyboard
    // height. Both overlays anchored to the COLUMN must give that height back,
    // or their centring box differs between the two states.
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(chat, /const tabBarCompensation = keyboardVisible \? keyboardOffset : 0/);
    // The empty state and the jump-to-latest pill are the two column-anchored
    // ones; the composer overlays are screen-anchored and must NOT compensate,
    // or they would be pushed off the keyboard.
    const compensated = [...chat.matchAll(/bottom: composerHeight \+ tabBarCompensation/g)];
    assert.equal(
      compensated.length,
      2,
      "exactly the two column-anchored overlays compensate",
    );
    assert.doesNotMatch(
      chat,
      /\[composerLift, \{ bottom: composerHeight \+ tabBarCompensation \}\][\s\S]{0,80}Composer overlays/,
      "the screen-anchored overlay group must stay uncompensated",
    );
  });

  it("the tab bar height has one definition, imported by its consumers", () => {
    // Root cause of the no-model card drifting ~7.5px when the keyboard
    // opened: three numbers for one bar (constant 60, prose 64, real 75).
    // The compensation subtracted 60+inset while the column grew by
    // 75+inset, so the centring box ended up 15px taller — half of which
    // the centred card absorbed as drift. The VALUE is device-verified
    // (it is the sum of BottomNav's classes, listed on the constant); what
    // a scan CAN lock is that there is exactly one definition and the
    // consumers import it instead of restating it.
    const defs = allSources().filter(({ source }) =>
      /(?:export )?const TAB_BAR_HEIGHT\s*=/.test(stripComments(source)),
    );
    assert.deepEqual(
      defs.map(({ file }) => file),
      ["components/BottomNav.tsx"],
    );
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(
      chat,
      /import \{ TAB_BAR_HEIGHT \} from "\.\.\/\.\.\/\.\.\/components\/BottomNav\.tsx"/,
      "the chat route must import the height, not invent its own number",
    );
    assert.doesNotMatch(
      chat,
      /const TAB_BAR_HEIGHT/,
      "a second definition is how the three numbers diverged",
    );
    // The stale prose that caused it: the comment claimed pt-2 + min-h-12
    // + pb-1 (60), a class BottomNav never had. Keep the docs honest.
    const nav = read("components/BottomNav.tsx");
    assert.doesNotMatch(nav, /min-h-12/, "the bar has no min-h-12; do not re-derive a wrong sum");
    assert.doesNotMatch(nav, /64px/, "the old prose number must stay dead");
  });

  it("the composer is the floating box, with no wrapper between it and the screen", () => {
    // A wrapper that only re-exports a transform is a second box that can
    // disagree with the one it wraps. That is not hypothetical: the previous
    // revision had the screen component's container lifting on one path and
    // the centred empty state padded on another, and the composer stopped
    // rising in exactly the empty-thread case. MessageInput is the box; the
    // chat route only says where it goes.
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    const input = read("components/chat/MessageInput.tsx");

    assert.match(
      chat,
      /<MessageInput\s+className="absolute inset-x-0 bottom-0"/,
      "the chat route positions the floating composer",
    );
    assert.doesNotMatch(
      chat,
      /useAnimatedStyle\(/,
      "the chat route must not hand-roll a transform: lifts come from the hook",
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
    assert.match(input, /style=\{lift\}/, "MessageInput carries its own lift");
    assert.match(input, /onLayout=\{onHeightChange\}/, "measured at the outermost level");

    // The field IS the composer: the docked full-bleed variant of the field
    // spec (DESIGN.md) — Clean White, radius 0, a 1px Hairline top border only,
    // no outer gutter. There is no bar behind it and no container around it,
    // which is the whole point of the change.
    assert.match(
      input,
      /className=\{`border-t border-border bg-surface-1\$\{className/,
      "the composer root is the full-bleed field: Clean White, hairline top",
    );
    assert.doesNotMatch(
      input,
      /bg-base/,
      "the Cool Paper bar is deleted, not merged into the field",
    );
    // Radius 0 is the documented exception for a full-bleed element. Scoped
    // to the root's own opening tag: the className is a template literal with
    // nested backticks, so a file-wide pattern would escape the tag and match
    // the rounded chips further down.
    const rootTag = input.slice(
      input.indexOf("<Animated.View"),
      input.indexOf(">", input.indexOf("<Animated.View")) + 1,
    );
    assert.doesNotMatch(
      rootTag,
      /rounded/,
      "radius 0 is the documented exception for a full-bleed element",
    );
    assert.doesNotMatch(
      input,
      /mb-3 flex-row items-end/,
      "the control row is flush with the bottom edge; the bar's padding is gone",
    );
    // The screen gutter is deliberately absent, so the field's own 16px
    // padding is the whole inset (DESIGN.md, "The gutter does not apply to a
    // full-bleed field"). A px-5 here would be a stacked gutter.
    assert.doesNotMatch(input, /className=\{`[^`]*\bpx-5\b/);
  });

  it("the composer rises by the FULL keyboard height, not height minus the inset", () => {
    // The actual bug. The composer is `absolute inset-x-0 bottom-0`, so its
    // bottom edge IS the bottom of the screen and it has to rise by
    // everything the keyboard takes. It was being passed insets.bottom while
    // anchored at 0, which under-lifted it by exactly the navigation bar
    // height — the reported "the chat input is not above the keyboard".
    const hook = read("hooks/useKeyboardLift.ts");
    const input = read("components/chat/MessageInput.tsx");

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
      "app/(drawer)/(tabs)/chat.tsx",
      "components/chat/MessageInput.tsx",
      "app/(drawer)/(tabs)/voice.tsx",
    ]) {
      const code = read(file);
      for (const m of code.matchAll(/paddingBottom:[^,}]*insets\.bottom/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("the composer's overlays inset once, at the group", () => {
    // The overlays sit over message content now, not over a bar, so each
    // carries its own fill — but the horizontal inset is owned ONCE, by the
    // group. A child that also insets itself would sit 20px out from the
    // field's 16px content, and that misalignment is visible on every screen.
    // DESIGN.md: "gutters are owned by one layer".
    const offenders: string[] = [];
    // Only the ROOT of each overlay is checked. A chip or a pill padding
    // ITSELF (px-3 on the usage pill, px-4 on a prompt chip) is internal
    // padding and perfectly legal; what must not come back is a container
    // adding a screen inset on top of the group's.
    for (const file of [
      "components/chat/SuggestedPrompts.tsx",
      "components/chat/UsageStats.tsx",
    ]) {
      const root = read(file).match(/className="[^"]*"/)?.[0] ?? "";
      if (/\bpx-[45]\b/.test(root)) {
        offenders.push(`${file}: its root carries a screen inset: ${root}`);
      }
    }

    // The group MUST be the element that owns the inset, asserted positively
    // rather than by counting: an earlier version counted occurrences of the
    // group string starting at that string's own index, so the count could
    // never be 0 and the assertion could only fire on an exact duplicate.
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(
      chat,
      /className="absolute inset-x-0 px-4"/,
      "the overlay group owns the screen inset",
    );
    assert.deepEqual(offenders, []);
  });

  it("no persistent bar sits over the newest message", () => {
    // The "Load a model to keep chatting" banner with a Go to Models button
    // was removed deliberately. It was the one overlay that PERSISTED for a
    // whole conversation (unload a model mid-thread and it appeared over live
    // content), so it covered the newest message permanently, and it was the
    // only thing asking the list to reserve space for something over it. The
    // in-conversation no-model signal is now the field's placeholder, which
    // costs no layout, plus a tappable chip on focus.
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    const input = read("components/chat/MessageInput.tsx");

    // Asserted POSITIVELY: there is no in-composer prompt for the no-model
    // state at all. The field's placeholder is the whole signal, and the
    // models screen is reached from the header wordmark or the empty thread's
    // own card. Checking only for one label's absence would pass if a prompt
    // came back under a different name.
    assert.doesNotMatch(chat, /Load a model/);
    assert.doesNotMatch(chat, /Go to Models/);
    // (The header wordmark still routes to /models - that is the intended way
    // there, so a bare router.push assertion would be wrong here.)
    // The placeholder carries the state, on the engine-accurate gate rather
    // than the stale-able `connection` check. It is one line by design: the
    // field is ~22 characters wide, and the old two-sentence copy wrapped to
    // three lines, making the EMPTY composer as tall as a paragraph.
    assert.match(input, /Model not loaded\./);
    assert.doesNotMatch(input, /Please initialize the model/);
    assert.match(input, /Loading model…/);
    assert.match(input, /const composerPlaceholder = modelReady/);
  });

  it("the rows the field owns are inside the measured field", () => {
    // The attach preview is the one row that must NEVER be an overlay: as one
    // it would sit over the newest message for as long as an image is
    // attached, and extraContentPadding (fed from the field's onLayout) would
    // not know about it. That is the 6f8d572 bug. So it lives inside the
    // outermost field box, ahead of the control row.
    const input = read("components/chat/MessageInput.tsx");
    const root = input.indexOf("<Animated.View");
    const close = input.indexOf("</Animated.View>", root);
    assert.notEqual(root, -1, "the field root must exist");
    assert.notEqual(close, -1, "the field root must close");
    const field = input.slice(root, close);

    assert.match(
      field,
      /mx-4 mb-2 rounded-lg bg-surface-2/,
      "the attach preview is a box inside the field, and Mist on white",
    );
    // G8 moved the row onto an inner wrapping view (up to five thumbs), so
    // the flex lives one level down now. The in-flow property is unchanged
    // and is what the assertion below actually protects.
    assert.match(field, /flex-row flex-wrap items-center gap-2/);
    // Being *written* inside the field is not enough: an `absolute` preview
    // would still be out of flow, still overlay the newest message, and still
    // be missing from the field's measured height. Proved by mutation — the
    // first version of this guard passed with `absolute` prepended.
    assert.doesNotMatch(
      field,
      /absolute[^"]*mx-4 mb-2|mx-4 mb-2[^"]*absolute/,
      "the attach preview must stay in flow, or the measured height lies",
    );
    // The issue lines live here too, for the same reason.
    assert.match(field, /px-4 pb-1 font-sans text-xs text-secondary-text/);
    // ...and the banners must NOT, or they are overlays again.
    assert.doesNotMatch(field, /SuggestedPrompts|UsageStats/, "the banners are overlays");
  });

  it("the docked field keeps the tokens the amended design system requires", () => {
    // Full-bleed Clean White, square, 1px Hairline top only, 16px value inset.
    // Asserted positively so an empty or truncated file cannot pass it.
    const input = read("components/chat/MessageInput.tsx");
    assert.match(input, /className=\{`border-t border-border bg-surface-1\$\{className/);
    // Scoped to the ROOT class, not the whole file: the intent is that the
    // docked field draws one 1px line, not that the string `border-b` may
    // never appear. A child row inside the field may legitimately carry a
    // divider (the edit bar does) without drawing onto a screen edge.
    const rootStart = input.indexOf("className={`border-t border-border bg-surface-1");
    const rootClass = input.slice(rootStart, input.indexOf("`}", rootStart));
    // Top border ONLY: an all-round `border` here would draw two 1px lines
    // straight onto the screen edges.
    assert.doesNotMatch(rootClass, /className=\{`border /);
    assert.doesNotMatch(rootClass, /\bborder-(l|r|b)\b/);
    assert.doesNotMatch(input, /\bbg-base\b/, "the Cool Paper bar is deleted, not merged");
    // The value sits 16px from the edge, so the control row carries px-4 and
    // the root carries no horizontal inset at all.
    assert.match(input, /flex-row items-end gap-2 px-4 py-3/);
    assert.doesNotMatch(input, /className=\{`[^`]*\bpx-5\b/);
    assert.doesNotMatch(input, /mb-3 flex-row items-end/, "flush with the bottom edge");
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
