/** Download progress display: percent clamping, byte formatting, ETA.
 *
 * `formatBytes` and `formatEta` are ports of PocketPal's progress maths so
 * the two apps read identically to a user:
 * `src/utils/formatters.ts:16-41` (bytes) and the live listener at
 * `services/downloads/DownloadManager.ts:88-120` (speed + ETA).
 *
 * `formatBytes` is decimal base 1000 by default and emits `kB`, not binary
 * `KB` — that changed every byte string in the app when it was ported, and
 * these cases pin the port so it cannot drift back.
 *
 * Two deliberate carries from the reference: the speed label divides by
 * 1024 while the byte string divides by 1000, and there is no hours branch,
 * so a slow large transfer renders `1000 min`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { clampPercent, formatBytes, formatEta, progressCaption } from "../lib/models/progress.ts";

describe("clampPercent", () => {
  it("passes an in-range percent through untouched", () => {
    assert.equal(clampPercent(0), 0);
    assert.equal(clampPercent(63.4), 63.4);
    assert.equal(clampPercent(100), 100);
  });

  it("clamps an overshoot from a re-stat back to 100", () => {
    assert.equal(clampPercent(104), 100);
  });

  it("clamps a negative back to 0", () => {
    assert.equal(clampPercent(-2), 0);
  });
});

describe("formatBytes", () => {
  it("reads as bytes at and below zero", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(-5), "0 B");
  });

  it("uses decimal 1000-based units by default", () => {
    assert.equal(formatBytes(1024), "1.02 kB");
    assert.equal(formatBytes(1_048_576), "1.05 MB");
    assert.equal(formatBytes(1_000_000_000), "1 GB");
  });

  it("strips trailing zeros", () => {
    assert.equal(formatBytes(1_500_000), "1.5 MB");
  });

  it("switches to binary units on request", () => {
    assert.equal(formatBytes(1024, 2, true), "1 KiB");
    assert.equal(formatBytes(1024 ** 3, 2, true), "1 GiB");
  });

  it("honours threeDigits, widening precision as the value shrinks", () => {
    assert.equal(formatBytes(12_345_678, 2, false, true), "12.3 MB");
    assert.equal(formatBytes(1_234_567, 2, false, true), "1.23 MB");
  });
});

describe("formatEta", () => {
  it("counts seconds below a minute", () => {
    assert.equal(formatEta(1_000, 500), "2 sec");
  });

  it("switches to whole minutes at sixty seconds", () => {
    assert.equal(formatEta(60_000, 1_000), "1 min");
    assert.equal(formatEta(240_000, 1_000), "4 min");
  });

  it("rounds up, never down, so it never promises less time than it has", () => {
    assert.equal(formatEta(2_400, 1_000), "3 sec");
  });

  it("has no hours branch, matching the reference: 3600s is 60 min", () => {
    assert.equal(formatEta(3_600_000, 1_000), "60 min");
  });

  it("reads zero when stalled rather than dividing by a dead speed", () => {
    assert.equal(formatEta(1_000, 0), "0 sec");
  });
});

describe("progressCaption", () => {
  it("renders bytes, speed and ETA in one line with no percentage", () => {
    assert.equal(
      progressCaption(1_048_576, 4_200_000_000, 5_682_000),
      "1.05 MB (5.42 MB/s) ETA: 13 min",
    );
  });

  it("divides the speed by 1024 while the byte string uses 1000", () => {
    // 1024 B/s -> 1024/1024/1024 = 0.00 MB/s to two decimals. Inherited
    // from the reference; pinned so it cannot be "fixed" by accident.
    assert.equal(progressCaption(1_000, 2_000, 1024), "1 kB (0.00 MB/s) ETA: 1 sec");
  });
});