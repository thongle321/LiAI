/** Interrupted-download resume state: killed mid-flight, continue by bytes.
 *
 * The Expo legacy downloader resumes with `Range: bytes=N-` when a partial
 * file is handed back as resumeData — same mechanism as PocketPal's worker.
 * This module owns the only decision: when partial bytes are worth
 * continuing from (red-then-green, no native seam to test against).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resumeDataForPartial } from "../lib/models/resume-state.ts";

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
