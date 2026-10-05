/** G6: the composer thinking toggle.
 *
 * Source-grepped, like `message-list.test.ts` and
 * `generation-settings.test.ts`: the rules below are architectural (what
 * the pill is wired to, and what it deliberately does NOT do), and none
 * of them would survive a behavioural test failing loudly.
 *
 * Run: node --test tests/thinking-pill.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Repo-relative, and with block comments stripped so a rule can never
 *  be satisfied by prose describing it. */
function read(file: string): string {
  return readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

const src = read("components/chat/MessageInput.tsx");

test("the composer carries the thinking toggle", () => {
  // It was reachable only from Settings, so the user had to leave the
  // conversation to turn it off.
  assert.match(src, /<Brain/, "a Brain glyph marks the pill");
  assert.match(src, />\s*Think\s*</, "and it carries the word, per DESIGN.md");
  assert.match(src, /setThinkingEnabled\(!thinkingEnabled\)/, "it toggles the store flag");
  assert.match(
    src,
    /accessibilityRole="switch"/,
    "a switch role, so state is announced rather than inferred from colour",
  );
  assert.match(
    src,
    /accessibilityState=\{\{ checked: thinkingEnabled/,
    "and the checked state is exposed",
  );
});

test("the switch label is stable, never an imperative", () => {
  // VoiceOver reads "label, switch, checked". A label that flipped to
  // "Disable thinking" announced "Disable thinking, switch, on" -- an
  // instruction contradicting the state beside it. The blocked case
  // belongs in the hint, which is what keeps the label from moving.
  assert.match(src, /accessibilityLabel="Thinking"/, "the label names the thing");
  assert.doesNotMatch(
    src,
    /accessibilityLabel=\{[^}]*[Ee]nable thinking/,
    "an imperative switch label is the defect, in either direction",
  );
  assert.match(src, /accessibilityHint=\{thinkingHint\}/, "the block goes in the hint");
});

test("the pill is local-only", () => {
  // `enableThinking` is a llama.rn jinja flag (lib/inference/engine.ts).
  // Showing the pill under a remote API would promise a capability the
  // remote engine cannot honour.
  assert.match(
    src,
    /activeProviderType\) === "local"/,
    "gated on the active provider being local",
  );
  assert.match(src, /\{thinkingLocal && \(/, "and hidden entirely when not local");
});

test("no effort cycle", () => {
  // PocketPal's pill double-taps through graded reasoning effort. LiAI has
  // no effort concept anywhere, so shipping levels here would be a control
  // with nothing behind it.
  assert.doesNotMatch(src, /cycleEffort|effortLevel|onDoublePress/);
});

test("G9: a blocked send answers the press instead of doing nothing", () => {
  // A disabled button fires no press, so there was nothing to haptic.
  // PocketParity (ChatInput.tsx:228-240): warning haptic + a temporary
  // helper line. The button KEEPS its disabled look -- only `disabled` is
  // dropped so the press can answer.
  assert.match(
    src,
    /Haptics\.notificationAsync\(\s*Haptics\.NotificationFeedbackType\.Warning/,
    "a warning haptic, as pocketpal fires",
  );
  assert.match(src, /setBlockedNote\("Load a model to send this message\."\)/);
  // Only an EMPTY draft is truly inert. Gating on `!canSend` again would
  // restore the silent no-op this gap is about.
  assert.match(
    src,
    /disabled=\{draft\.trim\(\) === ""\}/,
    "a non-empty draft must still answer the press",
  );
  assert.doesNotMatch(src, /disabled=\{!canSend\}/);
});

test("G9: the helper line is temporary, not a permanent second status", () => {
  assert.match(src, /setTimeout\(\(\) => setBlockedNote\(null\), \d+\)/);
  assert.match(src, /accessibilityLiveRegion="polite"/);
});

test("the Settings sheet still does not write the flag directly", () => {
  // The sheet is write-through on a draft, so it must not set the flag on
  // Save. The composer pill is the one direct control.
  const sheet = read("components/chat/GenerationSettingsSheet.tsx");
  const apply = sheet.slice(
    sheet.indexOf("function apply"),
    sheet.indexOf("function reset"),
  );
  assert.doesNotMatch(apply, /setThinkingEnabled\(/);
});