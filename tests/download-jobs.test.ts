/** Latest-job lookup for model downloads. Run: node --test tests/download-jobs.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { claimTerminal, latestJobForModel } from "../lib/models/download-jobs.ts";
import type { DownloadJob } from "../types/models.ts";

function job(over: Partial<DownloadJob> & { id: string; modelId: string }): DownloadJob {
  return {
    fileName: "m.gguf",
    downloadUrl: "https://example.com/m.gguf",
    destinationPath: "/tmp/m.gguf",
    status: "downloading",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 100,
    resumable: true,
    ...over,
  };
}

describe("latestJobForModel", () => {
  it("returns undefined when no job matches", () => {
    assert.equal(latestJobForModel([job({ id: "a", modelId: "x" })], "y"), undefined);
  });

  it("returns the latest job, not a stale terminal one", () => {
    const jobs = [
      job({ id: "old", modelId: "m", status: "failed" }),
      job({ id: "live", modelId: "m", status: "paused" }),
    ];
    assert.equal(latestJobForModel(jobs, "m")?.id, "live");
  });

  it("ignores other models", () => {
    const jobs = [
      job({ id: "other", modelId: "z", status: "paused" }),
      job({ id: "mine", modelId: "m", status: "paused" }),
    ];
    assert.equal(latestJobForModel(jobs, "m")?.id, "mine");
  });
});

describe("claimTerminal", () => {
  // The module now EMITS terminal states (parity with PocketPal's
  // onDownloadComplete/onDownloadFailed), so the same completion reaches
  // JS twice: once from the live event, once from the 1 s poll. onComplete
  // must fire on exactly the first arrival.
  it("claims the first arrival of a terminal state", () => {
    const seen = new Set<string>();
    assert.equal(claimTerminal(seen, "d1", "completed"), true);
    assert.equal(claimTerminal(seen, "d1", "completed"), false);
  });

  it("claims every terminal state, not just completion", () => {
    const seen = new Set<string>();
    assert.equal(claimTerminal(seen, "d2", "failed"), true);
    assert.equal(claimTerminal(seen, "d3", "cancelled"), true);
  });

  it("never claims a live state, and does not mark the id", () => {
    const seen = new Set<string>();
    assert.equal(claimTerminal(seen, "d4", "running"), false);
    assert.equal(claimTerminal(seen, "d4", "queued"), false);
    assert.equal(claimTerminal(seen, "d4", "paused"), false);
    assert.equal(seen.size, 0);
    // Still claimable afterwards: pause is not a claim.
    assert.equal(claimTerminal(seen, "d4", "completed"), true);
  });

  it("keeps ids independent — a retry starts from a clean claim", () => {
    const seen = new Set<string>(["d5"]);
    assert.equal(claimTerminal(seen, "d6", "failed"), true);
    seen.delete("d5"); // what resumeDownload does before re-running
    assert.equal(claimTerminal(seen, "d5", "completed"), true);
  });
});
