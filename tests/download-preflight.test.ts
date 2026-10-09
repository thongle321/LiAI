/** The download pre-flight: refuse a transfer that cannot fit, fail closed.
 *
 * Run: node --test tests/download-preflight.test.ts
 *
 * WHY A SOURCE SCAN: the start path lives in the models store, which imports
 * expo-file-system and the native download module. Neither exists under
 * `node --test`, and injecting both is a refactor larger than the rule it
 * would guard — the spec rules that out too. The RULE is pure
 * (lib/storage-fit.ts, ticket 01) and exhaustively tested there; what is
 * guarded here is the WIRING: that the start path asks that module, fails
 * closed on an unreadable reading, refuses before any transfer begins, and
 * records a reason the failure dialog already shows as a storage problem.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { downloadErrorBranch, downloadErrorCopy } from "../lib/models/download-error.ts";

// Comments are stripped before scanning: this file's own header QUOTES the
// old fail-open policy it is asserting is gone ("attempt anyway"), so an
// unstripped scan matches its own documentation.
const DOWNLOADS = readFileSync(
  path.join(import.meta.dirname, "..", "store", "models", "downloads.ts"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

describe("the download start path consults the storage-fit decision", () => {
  it("decides with the pure module, not an inline size comparison", () => {
    assert.match(
      DOWNLOADS,
      /import \{ modelFitsOnDevice \} from "\.\.\/\.\.\/lib\/storage-fit\.ts"/,
      "the rule is owned by one module so the cards and the pre-flight cannot drift",
    );
    assert.match(DOWNLOADS, /modelFitsOnDevice\(\{/, "the start path calls it");
    assert.doesNotMatch(
      DOWNLOADS,
      /free\s*<\s*activeFile\.size/,
      "the old inline comparison must be gone",
    );
  });

  it("fails closed when free space cannot be read", () => {
    assert.match(
      DOWNLOADS,
      /let free: number \| null = null/,
      "the figure starts unknown, so a read that throws leaves it null",
    );
    assert.match(DOWNLOADS, /freeBytes: free/, "one reading, one decision");
    // The decision must not be behind `if (free)`: an unread figure has to
    // REACH it, which is what turns "unknown" into "blocked".
    assert.doesNotMatch(
      DOWNLOADS,
      /if \(free/,
      "guarding the check on a successful read would fail open again",
    );
    assert.doesNotMatch(
      DOWNLOADS,
      /attempt anyway|try the transfer/,
      "the old fail-open policy must be gone",
    );
  });

  it("counts a pending projector toward a vision model's requirement", () => {
    assert.match(DOWNLOADS, /projectorBytes: spec\.projector\.size/);
    assert.match(
      DOWNLOADS,
      /step === "main"[\s\S]{0,80}?projectorBytes/,
      "only while the projector leg is still ahead of this one",
    );
  });

  it("refuses before the transfer starts, so no bytes move and no partial file is created", () => {
    const decision = DOWNLOADS.indexOf("modelFitsOnDevice(");
    const start = DOWNLOADS.indexOf("platformDownloadService.startDownload(");
    assert.ok(decision > 0, "the decision is in the start path");
    assert.ok(decision < start, "the refusal happens before the service is asked to transfer");
    assert.match(
      DOWNLOADS.slice(decision, start),
      /return;/,
      "a refusal returns out of the start path instead of falling through to the job",
    );
  });
});

describe("a refusal is something the failure dialog already understands", () => {
  const messages = [...DOWNLOADS.matchAll(/"(Not enough storage[^"]*)"/g)].map((m) => m[1]!);

  it("names storage, for a full disk and for a reading that failed", () => {
    assert.equal(
      messages.length,
      2,
      "one message for a disk that is too small, one for storage that could not be determined",
    );
  });

  it("every refusal reaches the dialog's storage branch, with its fix-it steps", () => {
    for (const message of messages) {
      assert.equal(
        downloadErrorBranch(message),
        "storage",
        `"${message}" must classify as storage, not as an unknown failure`,
      );
      assert.ok(
        downloadErrorCopy(message).steps.length > 0,
        `"${message}" must arrive with the numbered fix-it steps`,
      );
    }
  });
});