/** No auto-activation on download completion (spec: download-ui-parity, story 17).
 *
 * Run: node --test tests/download-no-auto-activate.test.ts
 *
 * WHY A SOURCE SCAN: the models store imports the filesystem and the native
 * download module, so it cannot be imported under `node --test` (see
 * android-download-driver.test.ts and download-preflight.test.ts for the same
 * pattern). What is guarded here is a single SIDE EFFECT, and a side effect is
 * exactly what a type error cannot see: the row still flips to Downloaded, the
 * app still compiles, and the only symptom is a chat that silently loads a
 * model nobody chose.
 *
 * Comments are stripped because this file's own subject is quoted in the
 * store's header — an unstripped scan matches its own documentation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

/** Block AND line comments stripped, so a rule can never be satisfied (or
 *  broken) by prose describing it. A "//" preceded by ":" is a URL. */
function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const downloads = read("store/models/downloads.ts");

describe("download completion does not activate a model", () => {
  it("never selects a model anywhere in the downloads store", () => {
    // Every leg funnels through this one module — the main leg, the vision
    // projector's second leg, and cold-start adoption of a transfer that
    // outlived JS — so one scan covers all of them.
    assert.doesNotMatch(
      downloads,
      /setActiveModel|activeModelId\s*[:=]/,
      "a completed download marks the model downloaded; the user taps Load",
    );
  });

  it("still marks the model downloaded and records where the file is", () => {
    // The removal is ONE side effect. Losing the rest of the completion path
    // would leave a downloaded file the store believes never landed.
    assert.match(downloads, /downloadStatus:\s*"completed"/);
    assert.match(downloads, /localPath:/);
    assert.match(downloads, /refreshGgufMetadata\(downloadJob\.modelId\)/);
    assert.match(downloads, /largestSuccessfulBytes/);
  });

  it("does not promise a model that will activate itself in the empty chat", () => {
    // The composer's "Model not loaded." is honest and stays. The empty
    // view's copy is the one that used to promise auto-activation.
    const empty = read("components/chat/ChatEmptyPlaceholder.tsx");
    assert.doesNotMatch(empty, /activate[sd]?[^"']*\b(moment|finish)/i);
    assert.match(empty, /Activate Model To Get Started/);
  });
});