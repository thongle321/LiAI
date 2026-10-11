/** Settings card pattern: drift guard.
 *
 * DESIGN.md, Settings, documents one structure for settings screens: a
 * titled row card per group, with the card itself owned by SettingsSection.
 * That structure arrived the way every pattern in this repo has — by
 * hand-rolling it once per screen and then slowly diverging, which is what
 * the tablet drift and the three-numbers-for-one-tab-bar defects were.
 *
 * A source scan, not a render test: the failure this prevents is a second
 * card implementation, which no rendering assertion would notice.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    if (entry === "node_modules" || entry === "pocketpal-ai" || entry === "tests") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function screenFiles(): string[] {
  // Relative to ROOT, which read() joins once.
  return [...sourceFiles("components"), ...sourceFiles("app")];}

describe("settings card pattern", () => {
  it("owns the row card in exactly one place", () => {
    // `.rows` is the card (Clean White, hairline, dividers edge to edge);
    // `.row` is a row inside one. Only SettingsSection may build the card.
    // Matches both the plain literal and the plain-modifier ternary
    // (`className={plain ? "rows rows--plain" : "rows"}`) — the card
    // class may not appear anywhere else, however it is composed.
    const owners = screenFiles().filter((f) =>
      /className=(?:"rows[ "]|\{[^}]*"rows)/.test(read(f)),
    );
    assert.deepEqual(
      owners.map((f) => path.relative(ROOT, f).replace(/\\/g, "/")),
      ["components/SettingsRows.tsx"],
    );
  });

  it("builds every settings section through SettingsSection", () => {
    // The sections these four own used to be a hand-rolled heading plus a
    // .rows card each. One constructor, or the pattern drifts again.
    const sections = ["InferenceSettings", "SearchSettings", "HfTokenSettings", "VoiceSettings"];
    for (const name of sections) {
      const file = screenFiles().find((f) => f.endsWith(`${name}.tsx`));
      assert.ok(file, `${name}.tsx should exist`);
      assert.match(
        read(file),
        /<SettingsSection/,
        `${name} must build its sections with SettingsSection`,
      );
    }
  });

  it("defines the sampler rows once, in one component", () => {
    // The sampler is the one list with a second host (the Generation sheet
    // renders it for both Session and Preset), so a second copy of these
    // rows would be a silent fork with its own defaults and ranges.
    const withSampler = screenFiles()
      .filter((f) => /label="TEMPERATURE"/.test(read(f)))
      .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    assert.deepEqual(withSampler, ["components/SamplerRows.tsx"]);
  });

  it("keeps Advanced collapsed until asked", () => {
    // A screen that opens 28 rows on first run is the thing the group exists
    // to prevent, so the default is load-bearing, not cosmetic.
    const rows = read("components/SettingsRows.tsx");
    const group = rows.slice(rows.indexOf("export function AdvancedGroup"));
    assert.match(group, /useState\(false\)/, "Advanced must start closed");
  });

  it("puts no settings group outside a card", () => {
    // The search key editor was a bare <View className="py-2"> sitting under
    // the Provider card: no surface, no divider, 8px from the card instead of
    // the 24px between groups. Group spacing belongs to SettingsSection, so a
    // hand-rolled margin in a settings file is the smell.
    for (const file of ["SearchSettings.tsx", "VoiceSettings.tsx", "HfTokenSettings.tsx"]) {
      const source = read(`components/${file}`);
      assert.doesNotMatch(
        source,
        /className="mb-6/,
        `${file} hand-rolls group spacing; SettingsSection owns it`,
      );
    }
    // The key editor is reached from a row (an ActionRow opening a sheet),
    // never rendered as a loose sibling beside the card.
    const search = read("components/SearchSettings.tsx");
    assert.doesNotMatch(
      search,
      /function ProviderKeys/,
      "the old loose key editor must not come back",
    );
    assert.match(
      search,
      /<ActionRow[\s\S]{0,400}label="API key"/,
      "the search key must be opened by a row, so it sits inside the card",
    );
  });

  it("keys the Advanced group's rows uniquely", () => {
    // This crashed the app: the rows were built with a key synthesised from
    // String(child), which is always "[object Object]", so every sibling row
    // got the SAME key. Children.toArray is used to flatten, so the map must
    // key off the index — the only value guaranteed unique among siblings.
    const rows = read("components/SettingsRows.tsx");
    const group = rows.slice(rows.indexOf("export function AdvancedGroup"));
    assert.doesNotMatch(
      group,
      /key=\{[^}]*String\(/,
      "String(element) is constant, so it cannot key a list",
    );
    assert.match(
      group,
      /Children\.toArray\(children\)\.map\(\(child, index\)/,
      "AdvancedGroup must map with an index to key its rows",
    );
    assert.match(group, /key=\{index\}/, "the row key must be the index");
  });

  it("gives every row a description", () => {
    // DESIGN.md, Settings: a bare label says nothing about what the value
    // does. Three rows shipped without one before this existed.
    //
    // EXCEPTION, models/ModelSettingsSheet.tsx: the Model Settings sheet is
    // the one surface held to PocketPal's copy verbatim, and the reference's
    // token rows are bare label+switch ("BOS", "EOS"). A description there
    // is a divergence from the reference, not an oversight — the rows that
    // DO need explaining (Reasoning, graded effort) carry help text below
    // them, which is where PocketPal puts it.
    const rows =
      /<(ToggleRow|StepperRow|SliderRow|PickerRow|Segmented|ActionRow|TextFieldRow)\b[\s\S]*?\/>/g;
    for (const file of [
      "SearchSettings.tsx",
      "VoiceSettings.tsx",
      "HfTokenSettings.tsx",
      "InferenceSettings.tsx",
      "SamplerRows.tsx",
    ]) {
      const source = read(`components/${file}`);
      for (const m of source.matchAll(rows)) {
        assert.ok(
          m[0].includes("description="),
          `${file}: <${m[1]}> "${m[0].match(/label="([^"]+)"/)?.[1] ?? "?"}" has no description`,
        );
      }
    }
  });

  it("never asks a native sheet for a snap point", () => {
    // snapPoints is not a height constraint, it is the BUG. On the community
    // sheet snapPoints turns OFF fitToContents
    // (BottomSheet.android.tsx: `enableDynamicSizing && (!snapPointsProp ||
    // snapPointsProp.length === 0)`), which flips the hosted child to
    // Modifier.fillMaxSize() and the surface to the full dialog, covering
    // the status bar. Android's own snap points are only half/full, so a
    // snapped sheet can never stop just below the status bar.
    //
    // EXCEPTION: the HF search and details sheets legitimately need
    // snapPoints because they host a FlatList that must fill the screen.
    // PocketParity: search at 92%, details at 90%. These are the only
    // sheets that may use snapPoints.
    const ALLOWED = new Set([
      "components/models/HFModelSearch.tsx",
    ]);
    const offenders = screenFiles().filter((file) => {
      const source = read(file);
      if (!/<BottomSheet/.test(source)) return false;
      // Only flag literal snapPoint values, not the wrapper's passthrough.
      if (!/snapPoints=\{[\s]*["']/.test(source)) return false;
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      return !ALLOWED.has(rel);
    });
    assert.deepEqual(
      offenders,
      [],
      "only the HF search sheets may use snapPoints; all others must fit content",
    );
  });

  it("grows the shared sheet's scroll view instead of zeroing its basis", () => {
    // REGRESSION. Uniwind compiles flex-1 to native `flex: 1`, which Yoga
    // resolves as flexBasis 0% — and a zero basis inside a maxHeight
    // container measured the scroll view to zero, rendering a WHITE sheet.
    // That cause was observed and confirmed by experiment on a device, not
    // guessed, which is what separates this guard from the snapPoints guard
    // it replaced.
    //
    // LIMITATION, stated rather than hidden: this is a text scan, so it
    // only sees the literal className. Moving `grow` into a .sheet--body
    // rule in global.css would satisfy the intent and fail this test, and a
    // refactor to <ScrollView style={...}> would pass it wrongly. There is
    // no renderer in this repo, so a layout assertion is not available; the
    // device check is what covers that gap.
    const sheet = read("components/Sheet.tsx");
    const body = sheet.match(/<(?:KeyboardAware)?ScrollView[\s\S]*?>/);
    assert.ok(body, "the sheet's body must be a scroll view");
    assert.match(
      body[0],
      /className="grow"/,
      "the body must grow, not flex its basis",
    );
    assert.doesNotMatch(
      body[0],
      /\bflex-1\b/,
      "flex-1 is flexBasis 0% and collapses the sheet",
    );
  });

  it("only flexes a sheet body when the sheet has a definite height", () => {
    // The rule this encodes was BOTH ways round, and both were observed on a
    // device rather than guessed:
    //
    //  - flexBasis 0 (Uniwind's flex-1) inside a container that does not
    //    bound the child measures the body to zero: the sheet, its drag
    //    indicator and its corners all render and the body is blank. That is
    //    the white sheet from commit 9e62cbb's aftermath.
    //  - The community sheet has no maxHeight / maxDynamicContentSize /
    //    topInset and never forwards `modifiers`, so the child's OWN height
    //    is the only lever on the surface. A maxHeight wrapper is an
    //    at-most box, which leaves RNHostView's childSize at zero so
    //    requiredSize never applies and the surface goes full-height,
    //    covering the status bar. A definite `height:` closes that loop on
    //    the first pass.
    //
    // So flex-1 is legal on a sheet body ONLY beside a definite height.
    //
    // It previously matched /<(KeyboardAware)?ScrollView/, which cannot match
    // <BottomSheetScrollView> — the guard went silently green over exactly
    // the file it existed to police. Any new body tag must be added here.
    const BODY = /<(?:KeyboardAware|BottomSheet)?ScrollView[^>]*className="[^"]*\bflex-1\b/;
    const DEFINITE_HEIGHT = /style=\{\{\s*height:/;
    const AT_MOST_HEIGHT = /style=\{\{\s*maxHeight:/;
    const offenders: string[] = [];
    for (const file of screenFiles()) {
      const source = read(file);
      if (!/<BottomSheet/.test(source)) continue;
      // The first scroll view after the sheet opening tag is the body.
      const body = source.slice(source.indexOf("<BottomSheet"));
      if (!BODY.test(body)) continue;
      const rel = file.replace(/\\/g, "/").split("/").slice(-2).join("/");
      if (AT_MOST_HEIGHT.test(source)) {
        offenders.push(`${rel}: flex-1 body under a maxHeight wrapper — white sheet`);
      }
      if (!DEFINITE_HEIGHT.test(source)) {
        offenders.push(`${rel}: flex-1 body with no definite height on the sheet wrapper`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "a flex-1 sheet body needs a definite `height:` wrapper, never `maxHeight:`",
    );
  });

  it("never puts @expo/ui's native Picker in a settings row", () => {
    // REGRESSION. @expo/ui's Android Picker renders a Material 3
    // ExposedDropdownMenuBox whose anchor is a TextField
    // (universal/Picker/Picker.android.tsx), and an M3 text field carries a
    // 56dp minimum height — so every picker row in the settings list came out
    // ~56dp tall with dead space above and below the control. The
    // `appearance="menu"` that was meant to make it compact is ignored on
    // Android outright: "Material 3 has no wheel-style picker".
    //
    // PickerRow now composes ExposedDropdownMenuBox itself with a Text
    // anchor, which is the alternative @expo/ui documents ("e.g. TextField
    // or Text"). This locks the primitive choice, which is the part that
    // regressed; the resulting row height is still a device check, because
    // this repo has no renderer to measure layout with.
    const source = read("components/SettingsRows.tsx");
    assert.doesNotMatch(
      source,
      /<Picker[\s>]/,
      "the native Picker anchors on a 56dp M3 TextField on Android",
    );
    assert.doesNotMatch(
      source,
      /appearance="menu"/,
      "appearance is ignored on Android and hid the real cause",
    );
  });

  it("uses the community slider, not the universal one", () => {
    // REGRESSION. The universal Slider (@expo/ui) does not forward
    // onValueChangeFinished, so the native side latches isDragging = true
    // and stops honoring the value prop after one drag — the control
    // could not be dragged at all. The community slider
    // (@expo/ui/community/slider) is a drop-in replacement for
    // @react-native-community/slider (what PocketPal uses) and honors the
    // value prop after a drag, so no key-remount workaround is needed.
    const source = read("components/SettingsRows.tsx");
    assert.match(
      source,
      /import Slider from "@expo\/ui\/community\/slider"/,
      "the slider must be the community drop-in, not the universal one",
    );
    assert.doesNotMatch(
      source,
      /<Host[^>]*>\s*<Slider[\s\S]*?<\/Host>/,
      "the community slider does not need a Host wrapper",
    );
  });

  it("gives the picker menu a width floor so options cannot collapse", () => {
    // REGRESSION. A Material 3 ExposedDropdownMenu sizes itself to its
    // anchor, and this anchor is a short value ("Tavily"), so the popup came
    // out a few characters wide and wrapped every option into a
    // one-word-per-line column. The floor belongs on the MENU, not the
    // anchor: a minimum lets long device voice names grow it instead of
    // truncating, and leaves the settings row its own compact width.
    // The popup lives in PickerMenu.android.tsx since the platform split;
    // the shared PickerRow must not grow Compose code back.
    const android = read("components/PickerMenu.android.tsx");
    // Match the WHOLE element, not just up to the first ">": the props carry
    // `onDismissRequest={() => ...}`, whose ">" would end a non-greedy
    // opening-tag match before `modifiers` is ever reached.
    const menu = android.match(/<ExposedDropdownMenu[\s\S]*?<\/ExposedDropdownMenu>/);
    assert.ok(menu, "the picker must render an ExposedDropdownMenu");
    assert.match(
      menu[0],
      /defaultMinSize\(\{\s*minWidth:/,
      "the menu needs a minWidth floor or its options wrap to a single column",
    );
    const shared = read("components/SettingsRows.tsx");
    assert.doesNotMatch(
      shared,
      /ExposedDropdownMenu|jetpack-compose/,
      "the Compose popup lives in the android file, not the shared row",
    );
  });

  it("keeps platform-only Expo UI imports on their own platform", () => {
    // Compose views have no iOS twin and SwiftUI views have no Android
    // twin. A jetpack-compose import evaluated on iOS (or swift-ui on
    // Android) is a crash waiting on a render, so each may only appear in
    // its platform file. Universal (`@expo/ui`) and community imports are
    // cross-platform and stay shared.
    for (const file of [
      "components/PickerMenu.ios.tsx",
      "components/SnackbarOverlay.ios.tsx",
    ]) {
      assert.doesNotMatch(
        read(file),
        /jetpack-compose/,
        `${file} must not import Compose views`,
      );
    }
    for (const file of [
      "components/PickerMenu.android.tsx",
      "components/SnackbarOverlay.android.tsx",
    ]) {
      assert.doesNotMatch(read(file), /swift-ui/, `${file} must not import SwiftUI views`);
    }
  });

// "never repeats a section title as a row label" retired: Q6B removed
// SettingsSection's title prop, so its target construct no longer exists.
// A sheet title over a row label is pocketpal's own pattern (HF row →
// "Hugging Face Token" sheet) and is pinned by tests/settings-sheets.test.ts;
// section titles themselves are pinned gone by tests/font-scale.test.ts.
});
