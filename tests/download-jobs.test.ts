/** Latest-job lookup for model downloads. Run: node --test tests/download-jobs.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { latestJobForModel } from "../lib/models/download-jobs.ts";
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
