/** Models-screen dialog copy (PocketParity: pocketpal-ai
 * ModelsResetDialog.tsx:22-56, ModelsScreen.tsx:206-262).
 *
 * Run: node --test tests/models-dialog-copy.test.ts
 *
 * WHY A SOURCE SCAN: both surfaces mount Alert/Modal and native icons, so
 * the runner cannot render them — the repo's standing pattern for copy that
 * must not drift from the reference.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string): string =>
  readFileSync(path.join(import.meta.dirname, "..", ...rel.split("/")), "utf8");

/** Strip block comments so a copy assertion cannot be satisfied by this
 *  repo's habit of quoting the reference's strings in the file header. */
const readCode = (rel: string): string =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "");

const RESET_DIALOG = readCode("components/models/ModelsResetDialog.tsx");
const IMPORT_HOOK = readCode("hooks/useLocalModelImport.ts");
const MODELS_SCREEN = readCode("app/(drawer)/models.tsx");
const PROJECTOR_SHEET = readCode("components/models/ProjectorSelectorSheet.tsx");

describe("reset models dialog", () => {
  it("carries the reference's title, body and both actions", () => {
    assert.match(RESET_DIALOG, /Confirm Reset/);
    assert.match(RESET_DIALOG, /Proceed with Reset/);
    assert.match(
      RESET_DIALOG,
      /This will reset model settings \('system prompt', 'chat template', 'temperature', etc\.\) to their default configuration\./,
    );
    assert.match(RESET_DIALOG, /- Your downloaded models will /);
    assert.match(RESET_DIALOG, /- Your 'Local Models' will remain intact\./);
  });

  it("offers no screen-reader button for the scrim", () => {
    // The dialog's only two controls are Cancel and Proceed with Reset. A
    // labelled scrim would be a third, full-screen one that a screen reader
    // lands on first and announces as one giant "Dismiss, button".
    const buttons = RESET_DIALOG.match(/accessibilityRole="button"/g) ?? [];
    assert.equal(buttons.length, 2, "Cancel and Proceed, nothing else");
    assert.doesNotMatch(RESET_DIALOG, /Dismiss reset dialog/);
  });

  it("is mounted by the models screen, not an inline Alert", () => {
    assert.match(MODELS_SCREEN, /<ModelsResetDialog/);
    assert.doesNotMatch(
      MODELS_SCREEN,
      /Alert\.alert\("Reset models"/,
      "the reset copy belongs to the dialog component",
    );
  });
});

describe("local model import", () => {
  it("asks the collision question in the reference's words", () => {
    assert.match(
      IMPORT_HOOK,
      /A file with this name already exists\. What would you like to do\?/,
    );
    assert.match(IMPORT_HOOK, /text: "Keep Both"/);
    assert.match(IMPORT_HOOK, /text: "Replace"/);
  });

  it("orders the buttons the way the reference does", () => {
    const replace = IMPORT_HOOK.indexOf('text: "Replace"');
    const keep = IMPORT_HOOK.indexOf('text: "Keep Both"');
    const cancel = IMPORT_HOOK.indexOf('text: "Cancel"');
    assert.ok(
      replace < keep && keep < cancel,
      "Replace / Keep Both / Cancel, left to right (ModelsScreen.tsx:213-228)",
    );
  });

  it("numbers a kept-both copy from one", () => {
    assert.match(IMPORT_HOOK, /let n = 1;/);
    assert.doesNotMatch(IMPORT_HOOK, /let n = 2;/);
  });

  it("says what it is doing while the file copies", () => {
    assert.match(IMPORT_HOOK, /Copying model file\.\.\./);
    assert.match(IMPORT_HOOK, /Failed to copy model file/);
  });
});

describe("projector dependent models", () => {
  it("labels the dependent list the way the reference does", () => {
    assert.match(
      PROJECTOR_SHEET,
      /Dependent models: /,
      "en.json models.multimodal.dependentModels",
    );
  });
});
