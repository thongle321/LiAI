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
    const owners = screenFiles().filter((f) => /className="rows[ "]/.test(read(f)));
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
    const rows =
      /<(ToggleRow|StepperRow|SliderRow|PickerRow|Segmented|NavRow|ActionRow|TextFieldRow)\b[\s\S]*?\/>/g;
    for (const file of [
      "SearchSettings.tsx",
      "VoiceSettings.tsx",
      "HfTokenSettings.tsx",
      "InferenceSettings.tsx",
      "SamplerRows.tsx",
      "models/ModelSettingsSheet.tsx",
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
    // snapPoints is not a height constraint, it is the BUG. The native
    // sheet applies no window insets at all (ModalBottomSheetView.kt has no
    // WindowInsets reference), so a snapped sheet covers the status bar; on
    // Android it can only rest at 'half' or 'full', so it cannot stop just
    // below the status bar; and its pan gesture fights a nested scroll
    // view, so the body will not scroll. Long sheets use components/Sheet.tsx.
    //
    // This replaces an earlier guard that required snapPoints on a sheet of
    // sampler rows. It was green through the whole outage because it
    // encoded the mechanism that was GUESSED, not the one that broke.
    const offenders = screenFiles().filter((file) => {
      const source = read(file);
      return /<BottomSheet/.test(source) && /snapPoints=/.test(source);
    });
    assert.deepEqual(
      offenders,
      [],
      "a native sheet must not use snapPoints; use components/Sheet.tsx",
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
    const body = sheet.match(/<ScrollView[\s\S]*?>/);
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

  it("never flexes a scroll view inside a native sheet", () => {
    // REGRESSION, and the reason the sheet went WHITE. flex-1 on the
    // KeyboardAwareScrollView gave it flexBasis 0 inside a native parent
    // that does not bound the child's height, so it measured to zero and
    // rendered nothing. The sheet, its drag indicator and its rounded
    // corners were all there; the body was blank.
    //
    // A static class is the tell, and it is worth a guard because the
    // sibling snapPoints guard was green through the whole outage: it
    // locked the mechanism that was guessed, not the one that broke.
    const offenders = screenFiles().filter((file) => {
      const source = read(file);
      if (!/<BottomSheet/.test(source)) return false;
      // The first scroll view after the sheet opening tag is the body.
      const body = source.slice(source.indexOf("<BottomSheet"));
      return /<(KeyboardAware)?ScrollView[^>]*className="[^"]*\bflex-1\b/.test(body);
    });
    assert.deepEqual(
      offenders,
      [],
      "a sheet's scroll view must not be flex-1; the native parent leaves it unbounded",
    );
  });

  it("never repeats a section title as a row label", () => {
    // "Voice" over a row called "Voice" reads as a stutter, and the user
    // reads it as two things that should be one.
    for (const file of ["VoiceSettings.tsx", "SearchSettings.tsx", "HfTokenSettings.tsx"]) {
      const source = read(`components/${file}`);
      for (const m of source.matchAll(/title="([^"]+)"/g)) {
        const title = m[1];
        assert.ok(
          !source.includes(`label="${title}"`),
          `${file}: the section title "${title}" is repeated as a row label`,
        );
      }
    }
  });
});
