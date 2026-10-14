/** Model Settings sheet — PocketPal anatomy pins (Part 2 audit follow-up).
 *
 * WHY A SOURCE SCAN: the sheet renders into the shared TrueSheet wrapper,
 * which node cannot load; the pins that matter are structural anyway —
 * section order, copy, the remote guards, and above all THE CLIP: the
 * sheet used to nest its own ScrollView inside the Sheet's scroller, and
 * the lower half of the content (Chat template, Reasoning, Save) could
 * never be reached on device. That regression must not come back.
 *
 * Run: node --test tests/model-settings-parity.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const SHEET = read("components/models/ModelSettingsSheet.tsx");
// The header doc lists every section name in order — before the JSX does.
// Scan the CODE, not the prose.
const SHEET_CODE = SHEET.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DIALOG = read("components/models/ChatTemplateDialog.tsx");
const MULTIMODAL = read("components/models/ModelMultimodalSection.tsx");
const TEMPLATES = read("lib/chat-templates.ts");

describe("the sheet never nests a scroller (the clip fix)", () => {
  it("renders its sections directly into the shared Sheet", () => {
    assert.doesNotMatch(
      SHEET_CODE,
      /<ScrollView/,
      "the Sheet already scrolls — a nested ScrollView clipped the lower half",
    );
    assert.match(SHEET, /<Sheet\b/, "the shared TrueSheet wrapper owns the scroller");
  });
});

describe("PocketPal section order", () => {
  it("runs Model Name → tokens → system prompt → template → stop words → multimodal → reasoning", () => {
    const order = [
      "Model Name",
      // No "Token settings" heading — the reference has none; the token
      // rows are carried by the dividers between them (BOS is its marker).
      "BOS",
      "System Prompt",
      // The template row's render site. ("Template:" itself also occurs
      // inside `chatTemplate:` in the save payload, and "Model default"
      // lives inside the TemplatePreview helper above the JSX — neither is
      // a position in the rendered order.)
      "<TemplatePreview",
      "STOP WORDS",
      // The reference owns the divider AND the heading around this
      // component, so both now live in the sheet.
      "<ModelMultimodalSection",
      "Reasoning model",
    ];
    let at = -1;
    for (const marker of order) {
      const next = SHEET_CODE.indexOf(marker);
      assert.ok(next > at, `section out of order or missing: ${marker}`);
      at = next;
    }
    // The reasoning title also exists in the effort module; the SHEET's
    // own title must be the one the order walked past.
    assert.ok(SHEET_CODE.indexOf("Model Name") < SHEET_CODE.indexOf("Reasoning model"));
    // The commit actions are NOT the last section of the body any more:
    // they ride the pinned bar, PocketPal's Sheet.Actions, which is the
    // `actions` prop on the shared Sheet (tests/sheet.test.ts pins it).
    assert.match(SHEET, /actions=\{/);
  });
});

describe("PocketPal copy", () => {
  it("labels the rows PocketPal labels", () => {
    for (const copy of [
      "Model Name",
      "BOS",
      "EOS",
      "Add Generation Prompt",
      "STOP WORDS",
      "Add new stop word",
      "Reasoning model",
      "Supports graded effort",
      "Multimodal Settings",
      "Edit Chat Template",
      "Reset",
      "Cancel",
      "Save Changes",
    ]) {
      const src = copy === "Edit Chat Template" ? DIALOG : SHEET;
      assert.ok(src.includes(copy), `missing copy: ${copy}`);
    }
  });

  it("carries the template dialog's notes and picker", () => {
    assert.match(DIALOG, /Base Chat Template:/);
    assert.match(
      DIALOG,
      /Changing the template may alter BOS, EOS, and system prompt\./,
    );
    assert.match(DIALOG, /Uses Jinja\. Leave empty to use the model's template\./);
    assert.match(DIALOG, /Enter your chat template here\.\.\./);
    // Picking a preset REPLACES the whole config, like PocketPal.
    assert.match(DIALOG, /onChange\(getChatTemplate\(name\)\)/);
  });

  it("ships the preset registry with the package's verbatim strings", () => {
    assert.match(TEMPLATES, /export const CHAT_TEMPLATES/);
    assert.match(TEMPLATES, /chat-formatter@0\.3\.4/);
    // The canonical presets exist; picking llama3 must carry its token.
    assert.match(TEMPLATES, /llama3: \{/);
    assert.match(TEMPLATES, /\|end_of_text\|/);
  });
});

describe("save model and guards", () => {
  it("writes through updateModelSettings on Save, and Reset restores defaults immediately", () => {
    assert.match(SHEET, /function handleSave[\s\S]*updateModelSettings\(modelId/);
    assert.match(SHEET, /function handleReset[\s\S]*DEFAULT_MODEL_SETTINGS/);
  });

  it("hides name/tokens/stop-words/Reset for remote models and keeps Reasoning", () => {
    assert.match(SHEET, /const isRemote = spec\?\.origin === "remote_api"/);
    // The local block (name through multimodal) sits inside the !isRemote
    // guard; the reasoning section renders after the guard closes.
    const guardAt = SHEET.search(/\{!isRemote \? \(/);
    const guardEnd = SHEET.indexOf(") : null}", guardAt);
    assert.ok(guardAt > 0 && guardEnd > guardAt, "the local-only block is guarded");
    assert.ok(
      SHEET.indexOf("Reasoning model") > guardEnd,
      "Reasoning renders for remote models too, outside the guard",
    );
    // Reset is local-only: its own {!isRemote ? ( block wraps it.
    assert.match(
      SHEET,
      /\{!isRemote \? \([\s\S]{0,400}?Reset/,
      "Reset must be hidden for remote models",
    );
    // Save Changes likewise.
    assert.match(SHEET, /\{!isRemote \? \([\s\S]{0,400}?Save Changes/);
  });

  it("reasoning writes through live, not on Save (PocketPal's pill contract)", () => {
    assert.match(SHEET, /setThinkingOverride\(modelId, !thinkingOn\)/);
    assert.match(SHEET, /setEffortOverride\(/);
    // The chips are the canonical levels, rendered from the shared module.
    assert.match(SHEET, /EFFORT_LEVELS\.map/);
  });

  it("multimodal section persists its selection immediately, like PocketPal's list", () => {
    assert.match(MULTIMODAL, /setProjector\(model\.id, file\)/);
    assert.match(MULTIMODAL, /startProjectorDownload\(model\.id\)/);
    assert.match(MULTIMODAL, /detachProjector\(model\.id\)/);
  });
});