/** Sheet layout guards: what node can pin about the shared Sheet's chrome.
 *
 * THE REVERSAL, recorded once, here, where the old decision lived.
 *
 * This file previously required the OPPOSITE of what it requires now. It
 * used to assert "keeps actions in the scroll body, never the native
 * footer" and to require callers to pass `insets.bottom` nowhere at all,
 * because TrueSheet's native footer is absolutely positioned
 * (TrueSheet.tsx `styles.footer`) and is NOT part of the 'auto' detent
 * (TrueSheetDetentCalculator.kt:61 — `contentHeight + headerHeight +
 * contentBottomInset`; `footerHeight` never appears in that branch), so a
 * row passed to it had to be measured and reserved as body padding, and
 * its lift above the keyboard could not be bounded from JS (device
 * observed, three fixes deep, hence the earlier decision).
 *
 * The current arrangement is PocketPal's and needs none of that.
 * pocketpal-ai/src/components/Sheet/Sheet.tsx + Actions.tsx renders THREE
 * PLAIN IN-FLOW CHILDREN — a header row, the scroller, then the action
 * row — and its pinned bar is a plain View with no `position: absolute`
 * anywhere in that directory. The bar is pinned by FLEX FLOW: the last
 * child of a column whose scroller sits above it. TrueSheet's content
 * view is a plain RN column when neither `style` nor `scrollable` reaches
 * it (TrueSheet.tsx:569-573), and `contentHeight` — the base of the 'auto'
 * detent — is the measured height of that whole column, so all three
 * children size the sheet together.
 *
 * Consequences the guards below pin: no native `footer`/`header` prop, no
 * absolute positioning, the bar AFTER the body in render order, both body
 * branches carrying the same `bodyBound` (= the surface box minus the two
 * measured siblings), and every sheet with commit actions passing the bar
 * instead of ending its scroll body with buttons.
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

/** The shared Sheet's source with comments stripped: the guards assert on
 *  code, and this file's own comments legitimately name `footer`,
 *  `header`, `scrollable` and `absolute` while explaining why they are
 *  absent. */
function sheetCode(): string {
  return read("components/Sheet.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

// Every sheet the app renders. GenerationSettingsSheet rides the shared
// Sheet; the rest call it directly; none may import a sheet library itself.
const SHEET_CALLERS = [
  "components/models/HFModelSearch.tsx",
  "components/models/RemoteModelSheet.tsx",
  "components/models/ModelSettingsSheet.tsx",
  "components/models/ChatTemplateDialog.tsx",
  "components/models/VisionDownloadSheet.tsx",
  "components/SearchSettings.tsx",
  "components/HfTokenSettings.tsx",
  "components/chat/GenerationSettingsSheet.tsx",
  "components/chat/ModelPickerSheet.tsx",
  "components/models/ProjectorSelectorSheet.tsx",
];

// Sheets with a commit-action row: their buttons belong in the pinned bar
// (PocketPal puts every one of these in Sheet.Actions). Pickers and
// per-row-action sheets are absent on purpose.
const PINNED_ACTION_SHEETS = [
  "components/models/ModelSettingsSheet.tsx",
  "components/models/ChatTemplateDialog.tsx",
  "components/HfTokenSettings.tsx",
  "components/SearchSettings.tsx",
  "components/chat/GenerationSettingsSheet.tsx",
  "components/models/VisionDownloadSheet.tsx",
  "components/models/RemoteModelSheet.tsx",
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
    // ONE auto detent for every sheet — short sheets wrap their content,
    // tall sheets grow and clamp natively to realScreenHeight - topInset
    // (TrueSheetDetentCalculator.kt:88). A fixed fraction is what made
    // every sheet read as fullscreen; 1.0 would fill to the status bar.
    // No fractions, no second detent.
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
    const body = sheetCode().match(/<(?:KeyboardAware)?ScrollView[\s\S]*?>/);
    assert.ok(body, "the sheet's body must be a scroll view");
    assert.match(body[0], /className="grow"/, "the body must grow, not flex its basis");
    assert.doesNotMatch(body[0], /\bflex-1\b/, "flex-1 is flexBasis 0% and collapses the sheet");
  });

  it("pins the action row in flow — no native footer, no absolute", () => {
    // The pinned bar is PocketPal's arrangement: an in-flow View rendered
    // as the LAST of the sheet's three children. A native `footer` prop is
    // absolute (TrueSheet.tsx styles.footer) and sits outside the measured
    // content, which is what forced the old footerHeight reserve; a native
    // `header` slot would move the header out of the column for no gain,
    // since `contentHeight` already includes it. Neither may come back.
    const sheet = sheetCode();
    assert.doesNotMatch(sheet, /\bfooter=/, "no native footer prop: it is absolute and unmeasured");
    assert.doesNotMatch(sheet, /\bheader=/, "no native header slot: the in-flow header is measured as content");
    assert.doesNotMatch(
      sheet,
      /position:\s*["'`]absolute["'`]/,
      "no absolute positioning: the bar is pinned by flex flow, as in PocketPal",
    );

    // Render order is the pin: the header, then the body, then the bar.
    // Anchor on the component's own return, not the first `return (` — the
    // useSlotHeight helper above it legitimately has one.
    const render = sheet.slice(sheet.indexOf("return (\n    <TrueSheet"));
    assert.ok(render.startsWith("return ("), "the FakeSheet component's render must be findable");
    let cursor = -1;
    for (const marker of ["{header}", "{body}", "{actionsBar}"]) {
      const at = render.indexOf(marker);
      assert.ok(
        at > cursor,
        `the sheet's children must render in order ${["{header}", "{body}", "{actionsBar}"].join(", ")}`,
      );
      cursor = at;
    }
  });

  it("keeps the header and the bar outside the scroller", () => {
    // The header used to live INSIDE the ScrollView, which is why it
    // scrolled away. Both chrome rows are siblings of the scroller now, so
    // neither may appear within its opening tag's children.
    const sheet = sheetCode();
    const scroller = sheet.match(/<ScrollView[\s\S]*?>/);
    assert.ok(scroller, "the sheet's body must be a scroll view");
    assert.doesNotMatch(
      scroller[0],
      /\{header\}|\{actionsBar\}/,
      "the header and the action bar must not render inside the scroller",
    );
  });

  it("never lets TrueSheet's scrollable flag make auto measure the screen", () => {
    // REGRESSION, device-observed (Q1: every sheet opened near-full). In
    // v3 the flag puts flex:1 on the content view inside an absolute-fill
    // container (TrueSheet.tsx:576,584), so contentHeight — which IS the
    // 'auto' detent — reports the screen and auto collapses to fullscreen.
    // The local `scrollable` prop only picks the body element; it must
    // never reach the TrueSheet component's props.
    const source = sheetCode();
    const start = source.indexOf("detents=");
    const end = source.indexOf("onDidDismiss=");
    assert.ok(start >= 0 && end > start, "the TrueSheet props block must exist");
    const propsBlock = source.slice(start, end);
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
    // dialog window already resizes above the keyboard natively
    // (MainActivity is adjustResize); the body must be a plain ScrollView
    // keeping tap-to-persist. Strip comments first: the regression story
    // legitimately NAMES the old component.
    const sheet = sheetCode();
    assert.doesNotMatch(
      sheet,
      /keyboard-controller|KeyboardAwareScrollView/,
      "the shared Sheet must not use keyboard-controller: its padding voids auto-detent bodies",
    );
    // Match the opening tag by its TERMINATOR (a '>' alone on its own line),
    // not by the first '>': a prop holding an arrow function -- onLayout
    // ={(e) => ...} -- supplies a '>' mid-tag and a lazy match would stop
    // there, silently truncating the props under test.
    const body = sheet.match(/<ScrollView[\s\S]*?^\s*>/m);
    assert.ok(body, "the sheet's body must be a plain ScrollView");
    assert.match(
      body[0],
      /keyboardShouldPersistTaps="handled"/,
      "the body must keep tap-to-persist so a tap outside the field dismisses the keyboard",
    );
  });

  it("pads the bottom of BOTH bodies and the bar with the nav-bar inset", () => {
    // REGRESSION, twice over.
    //
    // 1. The scrollable={false} branch resolved its bottom pad to
    //    `undefined` where the ScrollView branch used `insets.bottom`, so
    //    hf search and hf details dropped the inset entirely and sat under
    //    the navigation bar.
    //
    // 2. An attempt to derive the inset from onPositionChange shipped a
    //    worse bug and was reverted. That event's `position` is the sheet's
    //    TOP OFFSET, not its height (on device it equalled the top inset
    //    to the decimal), and its FIRST firing lands mid-present-animation
    //    — freezing it captured a 476px phantom that made sheets taller
    //    than their content and floated footers over their own fields.
    //    Neither the value nor the moment is trustworthy; insets.bottom
    //    reports the 3-button bar correctly on this device (47.87).
    //
    // The third pad is the pinned bar's, which now owns the bottom inset
    // for every sheet that has one — the one place it is needed, since the
    // bar IS the last thing on screen. Callers must not add their own.
    //
    // With a bar present the BODY pads nothing: two owners of one inset is
    // how it gets doubled, and a body pad under the bar is dead space.
    // Bar-less sheets still need the body pad, so it is a ternary, not a
    // constant — which is exactly why both branches must carry it.
    const sheet = sheetCode();
    assert.doesNotMatch(
      sheet,
      /onPositionChange/,
      "the bottom inset must not be derived from an animated sheet position",
    );
    const barPads = sheet.match(/paddingBottom: 10 \+ insets\.bottom/g) ?? [];
    assert.equal(barPads.length, 1, "only the pinned bar may pad the nav inset unconditionally");
    const bodyPads = sheet.match(/paddingBottom: actions \? 0 : insets\.bottom/g) ?? [];
    assert.equal(
      bodyPads.length,
      2,
      "both body branches must reserve the nav-bar inset for bar-less sheets only",
    );
    for (const file of [...SHEET_CALLERS, ...PINNED_ACTION_SHEETS]) {
      assert.doesNotMatch(
        read(file),
        /paddingBottom:\s*\d*\s*\+?\s*insets\.bottom/,
        `${file} must not pad the bottom inset itself; the shared Sheet owns it`,
      );
    }
  });

  it("bounds every body to the surface box minus the two siblings", () => {
    // With auto measuring wrap-content (scrollable off), a body taller
    // than the surface would be clipped at the top with no way to reach it.
    // The bound is the surface box the native sheet clamps to — window -
    // topInset - 16 — MINUS the header and the action bar, because both
    // are in-flow children whose heights the 'auto' detent sums in
    // (TrueSheetDetentCalculator.kt:61). Both body branches carry it.
    const sheet = sheetCode();
    // Both body branches carry it, and the clamp is part of the invariant:
    // a negative bound is meaningless to Yoga, so the subtraction is floored
    // at zero rather than handed on.
    assert.match(
      sheet,
      /const bodyBound = Math\.max\(0, bodyMaxHeight - headerHeight - actionsHeight\)/,
      "the bound must be the surface box minus the measured header and bar, floored at zero",
    );
    const bounds = sheet.match(/maxHeight: Math\.max\(0, bodyBound\)/g) ?? [];
    assert.equal(
      bounds.length,
      2,
      "both body branches (scroll wrapper and plain View) must carry the bodyBound",
    );
    assert.match(
      sheet,
      /const bodyMaxHeight = windowHeight - topInset - 16/,
      "the surface box must stay window - status-bar inset - gap",
    );
    // Both chrome slots must be measured: an unmeasured one is a body bound
    // that is too large by that slot's height, which pushes the last rows
    // and the bar past what the surface clamps to.
    assert.equal(
      (sheet.match(/onLayout=\{on/g) ?? []).length,
      2,
      "the header and the action bar must both report their height via onLayout",
    );
  });

  it("pins every commit action row in the bar, not the scroll body", () => {
    // The inverse of the old guard, and the point of the change: PocketPal
    // puts these sheets' commit buttons in Sheet.Actions. Per-row actions
    // (a model card's Load/Unload, a file row's Download) stay in the
    // body — they act on a row, not on the sheet.
    for (const file of PINNED_ACTION_SHEETS) {
      const source = read(file);
      const tag = source.match(/<Sheet[\s\S]*?>/);
      assert.ok(tag, `${file} must render through the shared Sheet`);
      assert.match(
        tag[0],
        /actions=\{/,
        `${file} must pin its commit actions in the bar: the scroll body's last children`,
      );
    }
  });

  it("never dismisses a sheet it never presented", () => {
    // REGRESSION, device-observed. The adapter called dismiss() for every
    // hidden sheet on mount — including the sort/author sheets nested
    // inside the HF search sheet — before their native views existed:
    // "already dismissed" warnings plus "TrueSheetView with tag not
    // found" crashes on the HF sheets. Dismiss may only fire after present.
    const source = sheetCode();
    assert.match(
      source,
      /presentedRef\.current = true/,
      "the adapter must record that it presented before it may dismiss",
    );
    assert.match(
      source,
      /else if \(presentedRef\.current \&\& !dismissedRef\.current\)/,
      "dismiss must be gated on a sheet this adapter presented and did not already dismiss",
    );
  });
});
