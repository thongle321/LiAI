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
  return [...sourceFiles("components"), ...sourceFiles("app")];
}

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
    // The sampler is the one list with a second host (the per-model
    // Generation view), so a second copy of these rows would be a silent
    // fork with its own defaults.
    const withSampler = screenFiles()
      .filter((f) => /label="Temperature"/.test(read(f)))
      .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    assert.deepEqual(withSampler, ["components/SamplingSettings.tsx"]);
  });

  it("keeps Advanced collapsed until asked", () => {
    // A screen that opens 28 rows on first run is the thing the group exists
    // to prevent, so the default is load-bearing, not cosmetic.
    const rows = read("components/SettingsRows.tsx");
    const group = rows.slice(rows.indexOf("export function AdvancedGroup"));
    assert.match(group, /useState\(false\)/, "Advanced must start closed");
  });
});
