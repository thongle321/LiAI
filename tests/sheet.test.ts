/** TrueSheet migration guards: what the node tests can pin about the swap.
 *
 * The layout contract the community sheet needed (definite child heights,
 * no flex-1 bodies without one, no snap points) belonged to a library
 * whose Material3 surface only rests at half/full. TrueSheet clamps every
 * detent to `realScreenHeight - topInset` natively
 * (TrueSheetViewController.kt:319-320, TrueSheetDetentCalculator.kt:88),
 * so the JS side carries no height math at all — and these guards pin
 * exactly that absence, plus the two things that must stay true across
 * the adapter: one sheet implementation, and one scroll-body rule.
 *
 * Run: node --test tests/sheet.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

// Every sheet the app renders. GenerationSettingsSheet rides the shared
// Sheet; the rest call it directly; none may import a sheet library itself.
const SHEET_CALLERS = [
  "components/models/HFModelSearch.tsx",
  "components/models/RemoteModelSheet.tsx",
  "components/models/ModelSettingsSheet.tsx",
  "components/SearchSettings.tsx",
  "components/HfTokenSettings.tsx",
  "components/chat/GenerationSettingsSheet.tsx",
];

describe("sheet library", () => {
  it("renders every sheet through the shared Sheet", () => {
    // One implementation, not six: a second sheet library is how the
    // half/full status-bar overlap came back last time.
    for (const file of [...SHEET_CALLERS, "components/Sheet.tsx"]) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /from ["']@expo\/ui\/community\/bottom-sheet["']|from ["']@gorhom\/bottom-sheet["']|require\(["']@expo\/ui\/community\/bottom-sheet["']\)/,
        `${file} must not import a sheet library directly`,
      );
    }
    for (const file of SHEET_CALLERS) {
      assert.match(
        read(file),
        /from ["']\.\.?\/.*Sheet\.tsx["']/,
        `${file} must render through the shared Sheet`,
      );
    }
    assert.match(
      read("components/Sheet.tsx"),
      /@lodev09\/react-native-true-sheet/,
      "the shared Sheet must be built on TrueSheet",
    );
  });

  it("keeps TrueSheet's detents honest", () => {
    // Q2-A: ONE auto detent for every sheet — short sheets wrap their
    // content, tall sheets grow and clamp natively to realScreenHeight -
    // topInset (TrueSheetDetentCalculator.kt:88). A fixed fraction is
    // what made every sheet read as fullscreen; 1.0 would fill to the
    // status bar. No fractions, no second detent.
    const source = read("components/Sheet.tsx");
    assert.match(
      source,
      /detents=\{\["auto"\]\}/,
      "the shared Sheet must use exactly one auto detent",
    );
    assert.doesNotMatch(
      source,
      /detents=\{[^}]*\d/,
      "no fractional detents: fractions re-introduce fixed-height sheets",
    );
  });

  it("grows the shared sheet's scroll view instead of zeroing its basis", () => {
    // REGRESSION, carried over from the community-sheet era. Uniwind
    // compiles flex-1 to native `flex: 1`, which Yoga resolves as
    // flexBasis 0% — and a zero basis inside a capped container measured
    // the scroll view to zero, rendering a WHITE sheet. That cause was
    // observed and confirmed by experiment on a device, not guessed.
    const sheet = read("components/Sheet.tsx");
    const body = sheet.match(/<(?:KeyboardAware)?ScrollView[\s\S]*?>/);
    assert.ok(body, "the sheet's body must be a scroll view");
    assert.match(body[0], /className="grow"/, "the body must grow, not flex its basis");
    assert.doesNotMatch(body[0], /\bflex-1\b/, "flex-1 is flexBasis 0% and collapses the sheet");
  });

  it("pins footers through the footer prop, never caller-side insets", () => {
    // REGRESSION WAITING TO HAPPEN. The shared Sheet owns the footer's
    // bottom spacing — the adapter pads the safe-area inset itself
    // (device-observed: TrueSheet's native footer container did NOT clear
    // this phone's 3-button nav, parking the pinned action behind the
    // system buttons). A caller that ALSO pads insets.bottom would double
    // it, so no caller may pass it; the wrapper's own pad is the one.
    const sheet = read("components/Sheet.tsx");
    assert.match(
      sheet,
      /footer=\{\s*footer \? \(\s*<View[\s\S]*?onLayout[\s\S]*?\{footer\}\s*<\/View>\s*\) : undefined\s*\}/,
      "the shared Sheet must wrap the footer at the boundary (measured, owning the bottom inset)",
    );
    for (const file of SHEET_CALLERS) {
      assert.doesNotMatch(
        read(file),
        /paddingBottom:\s*\d*\s*\+?\s*insets\.bottom/,
        `${file} must not pad the bottom inset itself; the footer prop owns it`,
      );
    }
  });

  it("never dismisses a sheet it never presented", () => {
    // REGRESSION, device-observed. The adapter called dismiss() for every
    // hidden sheet on mount — including the sort/author sheets nested
    // inside the HF search sheet — before their native views existed:
    // "already dismissed" warnings plus "TrueSheetView with tag not
    // found" crashes on the HF sheets. Dismiss may only fire after present.
    const source = read("components/Sheet.tsx");
    assert.match(
      source,
      /presentedRef\.current = true/,
      "the adapter must record that it presented before it may dismiss",
    );
    assert.match(
      source,
      /else if \(presentedRef\.current && !dismissedRef\.current\)/,
      "dismiss must be gated on a sheet this adapter presented and did not already dismiss",
    );
  });

  it("never lets TrueSheet's scrollable flag make auto measure the screen", () => {
    // REGRESSION, device-observed (Q1: every sheet opened near-full). In
    // v3 the flag puts flex:1 on the content view inside an absolute-fill
    // container (TrueSheet.tsx:576,584), so contentHeight — which IS the
    // 'auto' detent — reports the screen and auto collapses to fullscreen.
    // The local `scrollable` prop only picks the body element; it must
    // never reach the TrueSheet component's props.
    const source = read("components/Sheet.tsx");
    const start = source.indexOf("detents=");
    const end = source.indexOf("footer=");
    assert.ok(start >= 0 && end > start, "the TrueSheet props block must exist");
    // Strip line comments first: the inline note ABOUT the flag must not
    // trip the guard against passing it.
    const propsBlock = source
      .slice(start, end)
      .replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(
      propsBlock,
      /\bscrollable\b/,
      "TrueSheet's own scrollable prop would make auto = fullscreen",
    );
  });

  it("never scrolls the sheet body with keyboard-controller", () => {
    // REGRESSION, device-observed. The KeyboardAwareScrollView added
    // keyboard-height padding to the body's content — TrueSheet's auto
    // detent then sized the sheet to content+pad, and its scroll-to-focus
    // landed INSIDE that padding for short content: the whole body voided
    // (title/blurb/input gone) the moment the keyboard opened, and every
    // keystroke re-measured pad+scroll = stutter/flicker. Tall content
    // (HF) only scrolled within range, which is why it "worked". The
    // dialog window already resizes above the keyboard natively; the body
    // must be a plain ScrollView keeping tap-to-persist. Strip comments
    // first: the regression story legitimately NAMES the old component.
    // The package's STATE hook is deliberately allowed (see the keyboard
    // bound test): it only reports height — it is the padding/scrolling
    // COMPONENTS that voided auto-detent bodies.
    const sheet = read("components/Sheet.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(
      sheet,
      /KeyboardAwareScrollView|KeyboardAvoidingView|KeyboardStickyView/,
      "no keyboard-controller scrolling component: their padding voids auto-detent bodies",
    );
    const imports = [
      ...sheet.matchAll(/import\s+\{([^}]+)\}\s+from\s+["']react-native-keyboard-controller["']/g),
    ];
    assert.equal(imports.length, 1, "exactly one keyboard-controller import");
    assert.match(
      imports[0][1],
      /^\s*useKeyboardState\s*$/,
      "only useKeyboardState may be imported — components are banned here",
    );
    const body = sheet.match(/<ScrollView[\s\S]*?>/);
    assert.ok(body, "the sheet's body must be a plain ScrollView");
    assert.match(
      body[0],
      /keyboardShouldPersistTaps="handled"/,
      "the body must keep tap-to-persist so a tap outside the field dismisses the keyboard",
    );
  });

  it("shrinks the body when the keyboard lifts the footer", () => {
    // REGRESSION, device-observed: with the keyboard open, TrueSheet
    // lifts the absolute FOOTER to the keyboard edge but does NOT
    // shrink the body's box — tall content (HF sheet) kept flowing under
    // the lifted Save Token button, which floated over the instructions
    // card. Short content never reaches the footer zone, so the API-key
    // sheet looked fine; the bound must hold for any content. Height
    // comes from react-native-keyboard-controller's provider: RN core's
    // Keyboard module never fires for an input hosted in TrueSheet's
    // dialog window — the first fix shipped with it and the bound stayed
    // inert (device screenshot: label and input still rendered below the
    // footer) — while KVC's channel demonstrably heard this dialog (the
    // old KeyboardAwareScrollView padded and scrolled inside it).
    // Closed state keeps the original bound byte-for-byte.
    const sheet = read("components/Sheet.tsx");
    assert.doesNotMatch(sheet, /\[DEBUG-/, "no leftover debug instrumentation");
    assert.match(
      sheet,
      /useKeyboardState\(\(s\) => s\.height\)/,
      "the sheet must read the keyboard height from keyboard-controller's state",
    );
    assert.doesNotMatch(
      sheet,
      /Keyboard\.addListener|keyboardDidShow/,
      "RN core Keyboard does not hear dialog-window inputs — it kept the bound at 0",
    );
    assert.match(
      sheet,
      /const bodyMaxHeight = windowHeight - topInset - 16 - keyboardChrome/,
      "bodyMaxHeight must subtract the keyboard (else content runs under the lifted footer)",
    );
    assert.match(
      sheet,
      /keyboardHeight > 0 \? keyboardHeight \+ GRABBER_CHROME : 0/,
      "closed state keeps the original bound byte-for-byte",
    );
  });

  it("bounds every body so tall content scrolls instead of clipping", () => {
    // With auto now measuring wrap-content (scrollable off), a body taller
    // than the surface would be clipped at the top with no way to reach it.
    // Each body carries the same box the native surface clamps to —
    // window - topInset - 16, at-most, so short content still wraps.
    const source = read("components/Sheet.tsx");
    const bodies = source.match(/maxHeight: bodyMaxHeight/g) ?? [];
    assert.equal(
      bodies.length,
      2,
      "both body branches (scroll wrapper and plain View) must carry the maxHeight bound",
    );
    assert.match(
      source,
      /const bodyMaxHeight = windowHeight - topInset - 16/,
      "the bound must be the surface box: window - status-bar inset - gap",
    );
  });
});
