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

  it("pins footers through the native footer prop, never manual insets", () => {
    // REGRESSION WAITING TO HAPPEN. TrueSheet's footer container absorbs
    // the bottom safe-area inset natively (see Sheet.tsx's header); a
    // footer that also pads `insets.bottom` doubles it. The shared Sheet
    // strips that padding at the boundary, so no caller may pass it.
    const sheet = read("components/Sheet.tsx");
    assert.match(
      sheet,
      /footer=\{\s*footer \? \(\s*<View[\s\S]*?onLayout[\s\S]*?\{footer\}\s*<\/View>\s*\) : undefined\s*\}/,
      "the shared Sheet must wrap the footer at the boundary (measured, no caller padding)",
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
