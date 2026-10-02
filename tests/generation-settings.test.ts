/** Generation settings parity: the grilling decisions Q1-Q6 as source guards.
 *
 * The grilling round settled: one divider-less card with the source label
 * above it (Q2), a globally restacked SliderRow with an inline value input
 * (Q3), buffered edits with Save/Save-as-preset (Q4), "same as PocketPal"
 * extras (Q5: the JINJA switch), and validation with BOTH inline marks and
 * a summary alert (Q6=C). These are source scans — no renderer exists in
 * this repo, so the device check covers layout and the scans cover shape.
 *
 * Run: node --test tests/generation-settings.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const GEN = "components/chat/GenerationSettingsSheet.tsx";
const ROWS = "components/SamplerRows.tsx";
const SETTINGS = "components/SettingsRows.tsx";

/** Slice between two anchors; undefined-safe index math. */
function between(source: string, start: string, end: string): string {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + 1);
  assert.ok(a >= 0 && b > a, `anchors not found: ${start} → ${end}`);
  return source.slice(a, b);
}

describe("generation settings parity", () => {
  it("buffers edits and only commits on Save (Q4)", () => {
    const src = read(GEN);
    // apply() may touch the local draft only — no store writes, or the
    // sheet is back to write-through and Save/X cannot mean anything.
    const apply = between(src, "function apply", "function reset");
    assert.doesNotMatch(
      apply,
      /setSampler\(|setSessionSampler\(|setThinkingEnabled\(|setJinjaEnabled\(/,
      "apply must write only the draft",
    );
    // The Save must exist; the session footer must offer Save as preset.
    assert.match(src, /function handleSave/, "a Save handler must exist");
    assert.match(src, /Save as preset/, "the session footer must offer Save as preset");
    // Reset destinations, PocketPal's two (dropdown for sessions).
    assert.match(src, /Reset to preset/, "session reset offers 'Reset to preset'");
    assert.match(src, /Reset to System Defaults|Reset to system defaults/i,
      "reset offers the system-defaults destination");
  });

  it("renders one divider-less card with the source label above it (Q2)", () => {
    const rows = read(ROWS);
    assert.doesNotMatch(
      rows,
      /className="row"/,
      "pocketpal's param card has no dividers; .row would bring them back",
    );
    const gen = read(GEN);
    assert.equal(
      gen.match(/<SettingsSection/g)?.length ?? 0,
      1,
      "exactly one card: the params. The source control sits outside it",
    );
    assert.ok(
      gen.indexOf('"Settings source"') < gen.indexOf("<SettingsSection"),
      "the settings-source label must render above the card",
    );
    assert.doesNotMatch(
      gen,
      /follows the preset|The default every conversation/,
      "the intro paragraph pocketpal never had is deleted",
    );
  });

  it("restacks SliderRow: label → description → slider + inline input (Q3)", () => {
    const src = read(SETTINGS);
    const fn = between(src, "export function SliderRow", "export function Segmented");
    assert.doesNotMatch(
      fn,
      /RowLabel/,
      "RowLabel is the two-column header; pocketpal stacks label above the control",
    );
    assert.match(fn, /TextInput/, "pocketpal's InputSlider carries an inline numeric input");
    // Order: label/description texts first, then slider, then the input
    // beside it (pocketpal controlRow = slider flex, input to its right).
    const sliderAt = fn.indexOf("<Slider");
    const inputAt = fn.indexOf("<TextInput");
    assert.ok(sliderAt > 0 && inputAt > sliderAt, "slider renders before the inline input");
    assert.ok(
      fn.indexOf("text-secondary-text") < sliderAt,
      "the description renders above the control row",
    );
    // Debounce: pocketpal debounces slider commits by 300ms.
    assert.match(fn, /setTimeout/, "slider commits are debounced like pocketpal's 300ms");
  });

  it("validates Save with inline marks AND an alert (Q6=C)", () => {
    const gen = read(GEN);
    assert.match(gen, /Alert\.alert/, "a summary alert fires when Save finds invalid values");
    assert.match(
      gen,
      /errors=\{errors\}/,
      "the Save-time errors flow into the rows",
    );
    assert.match(
      read(ROWS),
      /error=\{errors\?\./,
      "the offending field is marked inline from those errors",
    );
    // TextFieldRow must be able to surface an EXTERNAL error (Save-time),
    // not only the one it detects while typing.
    const settings = read(SETTINGS);
    const textField = between(settings, "export function TextFieldRow", "/** A row whose control");
    assert.match(
      textField,
      /error\?: string/,
      "TextFieldRow takes an external error so Save-time validation can mark it",
    );
    // The typed bounds Save guards: custom n-predict and seed — the two
    // fields whose live checks are min-only (or absent).
    assert.match(gen, /8192/, "custom n-predict is validated against the 8192 cap");
  });

  it("defaults custom N PREDICT to 1024 like pocketpal", () => {
    const rows = read(ROWS);
    assert.match(rows, /\? -1 : 1024/, "pocketpal's custom length default is 1024");
    assert.doesNotMatch(rows, /\? -1 : 512/, "the old 512 default is gone");
  });

  it("builds the JINJA switch and threads it to llama.rn (Q5b)", () => {
    const rows = read(ROWS);
    assert.match(rows, /"JINJA"/, "pocketpal's last row is the JINJA switch");
    // The switch must be wired end to end — a dead switch is the one
    // thing worse than no switch.
    for (const file of [
      "store/inference.ts",
      "store/chat/index.ts",
      "lib/chat/turn.ts",
      "lib/agent/runner.ts",
      "lib/inference/engine.ts",
      "lib/inference/local-engine.ts",
    ]) {
      assert.match(read(file), /jinja/i, `${file} must carry the jinja flag`);
    }
  });
});
