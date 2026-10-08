/** Android download driver shape (PocketPal parity).
 *
 * Run: node --test tests/android-download-driver.test.ts
 *
 * WHY A SOURCE SCAN: the rate read 0 -> spike -> 0 because TWO writers fed
 * `apply()` — the 1 s poll and `onDownloadEvent`, delivering the same second
 * twice. Nothing about that shows up in a type error or a render; it only
 * shows as a caption that keeps resetting. PocketPal has a single writer
 * (the event stream) with `getActiveDownloads()` as the one-shot boot
 * recovery (ModelStore.ts:763 syncWithActiveDownloads), and that is the
 * architecture these assertions pin.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");

const driver = read("lib/android-download-service.ts");

describe("android download driver architecture", () => {
  it("has exactly one progress writer: the native event stream", () => {
    assert.doesNotMatch(
      driver,
      /setInterval/,
      "a second poll would deliver the same second twice and re-flicker the rate",
    );
    assert.doesNotMatch(driver, /\bpoller\b|beginPolling|stopPolling/, "poll machinery must stay gone");
    assert.match(driver, /addDownloadListener/, "events are the live feed");
  });

  it("still recovers work that outlived JS, via getActiveDownloads at boot", () => {
    // The poll was not the recovery path — reconcileWithNative is, and it
    // stays: a transfer that kept running under WorkManager while JS was dead
    // is adopted from the durable store on the next cold start.
    assert.match(driver, /reconcileWithNative/, "cold-start adoption must survive");
    assert.match(driver, /getActiveDownloads/, "adoption reads the same store the worker writes");
  });

  it("sends the worker a plain path, not expo's file:// URI", () => {
    // java.io.File reads a leading `file:` as a RELATIVE directory, so
    // mkdirs() failed and every download died with ENOENT.
    assert.match(driver, /nativeDestinationPath\(job\.destinationPath\)/);
  });
});