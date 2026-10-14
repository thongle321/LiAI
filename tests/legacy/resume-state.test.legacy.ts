/** Interrupted-download resume state: killed mid-flight, continue by bytes.
 *
 * The Expo legacy downloader resumes with `Range: bytes=N-` when a partial
 * file is handed back as resumeData — same mechanism as PocketPal's worker.
 * This module owns the only decision: when partial bytes are worth
 * continuing from (red-then-green, no native seam to test against).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyFileOnDisk, resumeDataForPartial } from "../lib/models/resume-state.ts";

describe("resumeDataForPartial", () => {
  it("returns the partial size when a middle chunk exists", () => {
    assert.equal(resumeDataForPartial(100, 1000), "100");
  });

  it("returns null when nothing was written", () => {
    assert.equal(resumeDataForPartial(0, 1000), null);
  });

  it("returns null when the file is already whole (completes, not resumes)", () => {
    assert.equal(resumeDataForPartial(1000, 1000), null);
  });

  it("returns null when the partial overshoots (stale file, restart clean)", () => {
    assert.equal(resumeDataForPartial(1200, 1000), null);
  });

  it("returns null for non-finite or unknown totals", () => {
    assert.equal(resumeDataForPartial(100, 0), null);
    assert.equal(resumeDataForPartial(100, Number.NaN), null);
  });
});

describe("classifyFileOnDisk", () => {
  it("calls an exact-length file complete", () => {
    assert.equal(classifyFileOnDisk(1000, 1000), "complete");
  });

  it("calls a short file partial", () => {
    assert.equal(classifyFileOnDisk(400, 1000), "partial");
  });

  it("calls an overshoot corrupt, the case that used to fall through", () => {
    // An error body appended onto a partial. Not complete, not resumable:
    // there is no clean partial left to extend, so it has to be deleted.
    assert.equal(classifyFileOnDisk(1200, 1000), "corrupt");
  });

  it("calls a zero-length file absent", () => {
    assert.equal(classifyFileOnDisk(0, 1000), "absent");
  });

  it("refuses to judge when the expected size is unknown", () => {
    // Acting on a guess here is how a good file gets deleted.
    assert.equal(classifyFileOnDisk(1000, 0), "unknown");
    assert.equal(classifyFileOnDisk(1000, Number.NaN), "unknown");
    assert.equal(classifyFileOnDisk(Number.NaN, 1000), "unknown");
    assert.equal(classifyFileOnDisk(1000, Number.POSITIVE_INFINITY), "unknown");
  });
});
