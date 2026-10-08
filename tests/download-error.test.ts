/** Download failure dialog (issue 01, gap C1) — REPLACES the inline reason.
 *
 * The parity fact-check found the original issue's premise wrong:
 * PocketPal DOES surface the failure reason — in a modal dialog
 * (`ModelsScreen.tsx:415-431`), never on the button. So the port is the
 * dialog: a taxonomy over LiAI's raw error strings, auto-opened from
 * failed store state, with Try Again on the button's own retry path —
 * and the button back to a plain "Retry".
 *
 * Run: node --test tests/download-error.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

import {
  downloadErrorBranch,
  downloadErrorCopy,
} from "../lib/models/download-error.ts";

const ROOT = path.join(import.meta.dirname, "..");
function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("download error taxonomy (C1)", () => {
  it("derives a branch from the stored string", () => {
    // Every string the store actually writes (downloads.ts / download-service.ts).
    assert.equal(
      downloadErrorBranch("Not enough storage space to download the model"),
      "storage",
    );
    assert.equal(downloadErrorBranch("HTTP 401"), "authentication");
    assert.equal(downloadErrorBranch("HTTP 403"), "authorization");
    assert.equal(downloadErrorBranch("HTTP 503"), "server");
    assert.equal(
      downloadErrorBranch("Size mismatch (3 of 10 bytes) — tap Retry to continue"),
      "integrity",
    );
    assert.equal(downloadErrorBranch("something nobody saw coming"), "other");
  });

  it("gives every branch a title and body, keeping the raw reason where it helps", () => {
    const samples = [
      "Not enough storage space to download the model",
      "HTTP 401",
      "HTTP 403",
      "HTTP 500",
      "Size mismatch (1 of 2 bytes) — tap Retry to continue",
      "boom",
    ];
    for (const message of samples) {
      const copy = downloadErrorCopy(message);
      assert.ok(copy.title.length > 0, `title for: ${message}`);
      assert.ok(copy.body.length > 0, `body for: ${message}`);
    }
    // The integrity message already tells the user what to do; the raw
    // message survives for anything unknown rather than being hidden.
    assert.match(downloadErrorCopy("Size mismatch (1 of 2 bytes) — tap Retry").body, /Size mismatch/);
    assert.match(downloadErrorCopy("boom").body, /boom/);
    assert.equal(downloadErrorCopy("boom").title, "Download failed");
  });

  it("gives only the branches with a real user action numbered steps", () => {
    // PocketParity: DownloadErrorDialog.tsx:207-224 (forbiddenSteps,
    // getTokenSteps). A 403 asks for a licence accepted over on Hugging
    // Face; a 401 asks for a token fixed in Settings. Both are walks, so
    // both are numbered.
    for (const message of ["Not enough storage space", "HTTP 401", "HTTP 403"]) {
      const { steps } = downloadErrorCopy(message);
      assert.ok(steps.length >= 2, `steps for: ${message}`);
      for (const step of steps) assert.ok(step.trim().length > 0);
    }
    // Nothing to walk through: a server blip is "try again in a moment",
    // and an unknown failure keeps its raw message instead.
    assert.deepEqual(downloadErrorCopy("HTTP 500").steps, []);
    assert.deepEqual(downloadErrorCopy("boom").steps, []);
    assert.deepEqual(
      downloadErrorCopy("Size mismatch (1 of 2 bytes)").steps,
      [],
    );
  });
});

describe("dialog wiring (C1)", () => {
  it("the models screen hosts it, driven by failed store state", () => {
    const src = read("app/(drawer)/models.tsx");
    assert.match(src, /<DownloadErrorDialog/, "hosted on the screen, one slot");
    assert.match(
      src,
      /downloadStatus === "failed" && m\.error/,
      "auto-opens on failure — and only on a failure that still HAS a reason, or dismissing A would mask B's fresh failure",
    );
    assert.match(src, /clearDownloadError/, "dismiss clears it, so it cannot nag");
    assert.match(src, /resumeInterruptedDownload/, "Try Again runs the button's own retry path");
  });

  it("the dialog renders the copy with an alert role and both actions", () => {
    const src = read("components/models/DownloadErrorDialog.tsx");
    assert.match(src, /accessibilityRole="alert"/, "the reason announces");
    assert.match(src, /downloadErrorCopy\(/, "one taxonomy, never re-derived");
    assert.match(src, /Try Again/, "retry in the dialog");
    assert.match(src, /Dismiss/);
  });

  it("offers the Hugging Face page and the numbered steps", () => {
    const src = read("components/models/DownloadErrorDialog.tsx");
    assert.match(src, /steps\.map\(/, "the fix-it steps are numbered");
    assert.match(src, /View on Hugging Face/, "licences are accepted over there");
    assert.match(src, /Linking\.openURL\(modelUrl\)/);
    // Fed by the failed spec's own repo page, so a preset with no Hub entry
    // simply renders no link rather than a dead one.
    const screen = read("app/(drawer)/models.tsx");
    assert.match(screen, /modelUrl=\{failedDownload\?\.modelUrl\}/);
    assert.match(screen, /hfUrl/);
  });

  it("the store can clear a dismissed error", () => {
    assert.match(
      read("store/models/types.ts"),
      /clearDownloadError: \(specId: string\) => void/,
    );
    assert.match(
      read("store/models/downloads.ts"),
      /clearDownloadError: \(specId\) =>/,
    );
  });
});

describe("the button is back to a plain Retry (replace)", () => {
  it("DownloadButton carries no reason any more", () => {
    const source = read("components/models/ModelBits.tsx");
    assert.doesNotMatch(source, /error\?: string/, "the error prop is gone");
    assert.doesNotMatch(source, /\{reason\}/, "no inline reason block");
    assert.doesNotMatch(
      source,
      /`Retry download\$\{/,
      "the a11y label no longer appends the reason — the dialog announces it",
    );
    assert.match(source, /\? "Retry"/, "the Retry floor stays");
  });

  it("no caller passes the error down any more", () => {
    assert.doesNotMatch(
      read("components/models/ModelCard.tsx"),
      /error=\{item\.error\}/,
    );
    assert.doesNotMatch(
      read("components/models/HFModelSearch.tsx"),
      /error=\{spec\?\.error\}/,
    );
    assert.doesNotMatch(
      read("components/models/AvailableModels.tsx"),
      /error=\{st\.error\}/,
    );
  });
});
