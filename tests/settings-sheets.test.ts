/** The HF token and search key sheets, pocketpal-identical (grilling Q1-Q8).
 * Run: node --test tests/settings-sheets.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const HF = "components/HfTokenSettings.tsx";
const SEARCH = "components/SearchSettings.tsx";
const ROWS = "components/SettingsRows.tsx";

describe("hugging face token sheet (Q2 bundle)", () => {
  const src = read(HF);

  it("carries their title, description and instructions card", () => {
    assert.match(src, /title="Hugging Face Token"/);
    assert.match(src, /Required to access gated models/);
    assert.match(src, /How to get a token:/);
    assert.match(src, /Go to huggingface\.co and sign in/);
    assert.match(src, /Navigate to Settings > Access Tokens/);
    assert.match(src, /"read" access/);
    assert.match(src, /Copy the token and paste it below/);
    // Mist card: surface-2, p-4, rounded-lg (their low-emphasis box).
    assert.match(src, /bg-surface-2 p-4 rounded-lg/);
  });

  it("the instructions link is a live feature (Q6)", () => {
    assert.match(src, /huggingface\.co\/settings\/tokens/);
    assert.match(src, /openURL/);
  });

  it("input: floating label, their placeholder, eye toggle starting hidden (Q2/Q7)", () => {
    assert.match(src, /Personal Access Token/);
    assert.match(src, /Paste your token here/);
    assert.match(src, /secureTextEntry=\{secure/);
    assert.match(src, /EyeOff/);
    // Prefill the saved secret, masked.
    assert.match(src, /setDraft\(hfToken \?\? ""\)/);
  });

  it("buttons: Reset Token / Save Token, disabled until non-empty, busy-locked (Q2/Q4)", () => {
    assert.match(src, />Reset Token</);
    assert.match(src, />Save Token</);
    assert.match(src, /!draft\.trim\(\)/, "save disabled while empty");
    assert.match(src, /busy/, "busy cross-lock");
    assert.match(src, /ActivityIndicator/, "spinner while writing");
    assert.match(src, /footer=\{/, "pinned footer like Sheet.Actions");
  });

  it("feedback: snackbar after close on success, inline error on failure (Q3)", () => {
    assert.match(src, /Token saved successfully/);
    assert.match(src, /Token removed successfully/);
    assert.match(src, /3000/, "their duration");
    assert.match(src, /Error saving token/);
    assert.match(src, /text-error/);
  });
});

describe("search key sheet (Q2/Q7/Q8)", () => {
  const src = read(SEARCH);

  it("title, brand-swapped blurb, their placeholder", () => {
    assert.match(src, /title="API key"/);
    assert.match(
      src,
      /Let the assistant search the web with its own tools\. Bring your own API key — LiAI never holds your keys or routes your queries\./,
    );
    assert.match(src, /`Paste your \$\{[^}]+\} API key`/);
  });

  it("prefills the saved key, eye toggle starts hidden", () => {
    assert.match(src, /setDraft\(k \?\? ""\)/);
    assert.match(src, /secureTextEntry=\{secure/);
    assert.match(src, /EyeOff/);
  });

  it("buttons: Clear Key / Set Key with busy cross-lock and inline error", () => {
    assert.match(src, />Clear Key</);
    assert.match(src, />Set Key</);
    assert.match(src, /Couldn't update the key\. Please try again\./);
    assert.match(src, /text-error/);
    assert.match(src, /!draft\.trim\(\)/);
  });

  it("Set Key is gated on consent (Q5)", () => {
    assert.match(src, /disabled=\{!hasConsented\}/);
    assert.match(src, /Accept the disclosure above to set a key/);
  });
});

describe("ActionRow gains the disabled state (Q5)", () => {
  it("renders a disabled button that swallows presses", () => {
    const rows = read(ROWS);
    assert.match(rows, /disabled\?: boolean/);
    assert.match(rows, /accessibilityState=\{\{ disabled/);
    assert.match(rows, /opacity-40/);
  });
});
