/** Latest-job lookup for model downloads. Run: node --test tests/download-jobs.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bytesPerSecond,
  claimTerminal,
  latestJobForModel,
  nativeDestinationPath,
  nativeStateToJobStatus,
  nextSpeedSample,
} from "../lib/models/download-jobs.ts";
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

describe("nextSpeedSample", () => {
  // The flicker bug: apply() is fed by TWO streams — the 1 s poll AND
  // onDownloadEvent (which fires on every Room write). Sampling the rate on
  // every delivery produced 0 -> value -> 0: a duplicate ~2 ms after the
  // real sample gave a 32 MB/s spike (or undefined), and the next genuine
  // second with no new bytes wrote a real 0. The window must survive
  // duplicates and only re-baseline when the byte count actually moves.
  it("first delivery establishes the baseline without a speed", () => {
    const [baseline, speed] = nextSpeedSample(undefined, 1_000, 5_000);
    assert.equal(baseline.bytes, 1_000);
    assert.equal(speed, undefined);
  });

  it("a duplicate delivery (same bytes) keeps the window open and reports nothing", () => {
    const prev = { bytes: 1_000, at: 5_000 };
    const [baseline, speed] = nextSpeedSample(prev, 1_000, 5_002);
    assert.equal(speed, undefined);
    assert.equal(baseline.at, 5_000, "the window must NOT restart on a duplicate");
  });

  it("a real advance reports the rate over the whole window", () => {
    const prev = { bytes: 1_000, at: 5_000 };
    const [baseline, speed] = nextSpeedSample(prev, 3_000, 6_000);
    assert.equal(speed, 2_000);
    assert.equal(baseline.bytes, 3_000);
    assert.equal(baseline.at, 6_000);
  });

  it("re-baselines but stays silent when the window is too short to mean anything", () => {
    const prev = { bytes: 1_000, at: 5_000 };
    const [baseline, speed] = nextSpeedSample(prev, 2_000, 5_050);
    assert.equal(speed, undefined);
    assert.equal(baseline.bytes, 2_000);
    assert.equal(baseline.at, 5_050);
  });

  it("a regressed byte count restarts the window instead of reporting a negative rate", () => {
    const prev = { bytes: 3_000, at: 5_000 };
    const [baseline, speed] = nextSpeedSample(prev, 1_000, 6_000);
    assert.equal(speed, undefined);
    assert.equal(baseline.bytes, 1_000);
  });
});

describe("nativeDestinationPath", () => {
  // THE download bug: expo's `documentDirectory` is a `file://` URI
  // (FileSystemModule.kt: Uri.fromFile(filesDirectory).toString() + "/"),
  // but the Kotlin worker does `new File(record.destination)`. Java reads
  // `file:` as a RELATIVE directory name, mkdirs() fails on a read-only
  // root, and every download died with:
  //   file:/data/.../Bonsai-1.7B-Q1_0.gguf: open failed: ENOENT
  // PocketPal never hit it: its path comes from RNFS.DocumentDirectoryPath,
  // a plain path with no scheme (ModelStore.ts:1274 getModelFullPath).
  it("strips the file:// scheme expo's documentDirectory carries", () => {
    assert.equal(
      nativeDestinationPath("file:///data/user/0/com.x/files/models/m.gguf"),
      "/data/user/0/com.x/files/models/m.gguf",
    );
  });

  it("also handles a one-slash file:/ URI", () => {
    assert.equal(
      nativeDestinationPath("file:/data/user/0/com.x/files/m.gguf"),
      "/data/user/0/com.x/files/m.gguf",
    );
  });

  it("leaves an already-plain path untouched", () => {
    assert.equal(
      nativeDestinationPath("/data/user/0/com.x/files/models/m.gguf"),
      "/data/user/0/com.x/files/models/m.gguf",
    );
  });

  it("never fabricates a path out of a non-file URI", () => {
    assert.equal(nativeDestinationPath("content://media/1"), "content://media/1");
  });
});

describe("nativeStateToJobStatus", () => {
  // The bug this guards: the worker's requeue() stores the failure reason
  // ("HTTP 503", a connect timeout) on a QUEUED row, and the old mapping
  // rendered queued as healthy "downloading" — so a retry loop showed a
  // live-looking card at 0% forever while PocketPal wrote FAILED there.
  it("renders a queued row WITH an error as failed, so the dialog can name it", () => {
    assert.equal(nativeStateToJobStatus("queued", "HTTP 503"), "failed");
    assert.equal(nativeStateToJobStatus("queued", "Failed to connect"), "failed");
  });

  it("renders a fresh queued row (no error yet) as downloading", () => {
    assert.equal(nativeStateToJobStatus("queued"), "downloading");
    assert.equal(nativeStateToJobStatus("queued", ""), "downloading");
  });

  it("keeps every other state on its plain mapping", () => {
    assert.equal(nativeStateToJobStatus("running"), "downloading");
    assert.equal(nativeStateToJobStatus("running", "HTTP 503"), "downloading");
    assert.equal(nativeStateToJobStatus("paused"), "paused");
    assert.equal(nativeStateToJobStatus("failed"), "failed");
    assert.equal(nativeStateToJobStatus("completed"), "completed");
    assert.equal(nativeStateToJobStatus("cancelled"), "cancelled");
  });
});

describe("bytesPerSecond", () => {
  // The Android driver polls once a second and the record carries raw bytes
  // but no speed — without this every WorkManager download rendered
  // "(0.00 MB/s) ETA: 0 sec" like a stalled transfer.
  it("divides the byte delta by the elapsed time", () => {
    assert.equal(bytesPerSecond(1_000, 0, 3_000, 2_000), 1_000);
  });

  it("returns undefined when there is no positive time span", () => {
    assert.equal(bytesPerSecond(0, 500, 1_000, 500), undefined);
  });

  it("returns undefined for a first tick with nothing to compare", () => {
    assert.equal(bytesPerSecond(0, 0, 0, 0), undefined);
  });

  it("reports 0 rather than a negative rate when a record regresses", () => {
    assert.equal(bytesPerSecond(3_000, 0, 1_000, 1_000), 0);
  });
});
