/** Latest download job per model (pure, node-tested).
 *
 * The service keeps terminal entries (completed/failed) until replaced, so
 * first-match lookups grab dead jobs — resume then throws "not paused" on
 * a live download. Every lookup goes through here: latest wins.
 */

import type { DownloadJob } from "../../types/models.ts";
import type { NativeDownloadState } from "../../modules/native-download/src/NativeDownloadModule.ts";

const TERMINAL_STATES: ReadonlySet<NativeDownloadState> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

/** True for the three states a download ends in. */
export function isTerminalState(state: NativeDownloadState): boolean {
  return TERMINAL_STATES.has(state);
}

/** True only on the FIRST arrival of a terminal state for this id, and
 *  marks the id so later arrivals are swallowed. Mutates `seen` — the
 *  caller owns the set, as it does for resume/cancel resets.
 *
 *  Why this exists: the native module emits terminal transitions itself
 *  (parity with PocketPal's onDownloadComplete/onDownloadFailed), while the
 *  1 s poll delivers the same record. Both paths reach `apply()`, and
 *  onComplete must run once — a second fire re-runs the store's completion
 *  block, re-activating the model and re-reading metadata.
 */
export function claimTerminal(
  seen: Set<string>,
  id: string,
  state: NativeDownloadState,
): boolean {
  if (!isTerminalState(state)) return false;
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
}

/** Native state → the JS card's vocabulary, with one deliberate twist.
 *
 *  A QUEUED row that carries an error is a retry waiting on WorkManager's
 *  backoff: the worker already failed once and requeue() stored the reason
 *  (`HTTP 503`, a connect timeout). Rendering that as "downloading" made a
 *  broken transfer look alive at 0% forever, while PocketPal writes FAILED
 *  in the same spot — so an errored queued row reads as `failed` and the
 *  dialog names the cause. A fresh queued row (no error yet) is a download
 *  that simply has not started, and still reads as downloading.
 */
export function nativeStateToJobStatus(
  state: NativeDownloadState,
  error?: string,
): DownloadJob["status"] {
  switch (state) {
    case "queued":
      return error ? "failed" : "downloading";
    case "running":
      return "downloading";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

/** Bytes per second between two samples; undefined when there is no positive
 *  time span to divide by (first tick, duplicate tick, clock wobble).
 *  Never negative: a regressed byte count (a record rewritten after a
 *  restart) reports 0 rather than a rate that renders as nonsense. */
export function bytesPerSecond(
  fromBytes: number,
  fromAt: number,
  toBytes: number,
  toAt: number,
): number | undefined {
  const elapsed = toAt - fromAt;
  if (elapsed <= 0) return undefined;
  return Math.max(0, Math.round(((toBytes - fromBytes) / elapsed) * 1000));
}

/** Convert expo's `file://` URI into the plain filesystem path the Kotlin
 *  worker needs.
 *
 *  `documentDirectory` is a URI (FileSystemModule.kt: `Uri.fromFile(dir)
 *  .toString() + "/"`), and expo's own APIs expect URIs — but the worker
 *  calls `java.io.File(record.destination)`, which reads a leading `file:`
 *  as a RELATIVE directory name. `mkdirs()` then fails on a read-only root
 *  and every download dies with `open failed: ENOENT`. PocketPal never hit
 *  this: its path comes from RNFS.DocumentDirectoryPath, a plain path with
 *  no scheme.
 *
 *  Only a leading `file:` scheme is rewritten; anything else is returned
 *  unchanged rather than turned into a path it is not.
 */
export function nativeDestinationPath(uri: string): string {
  return uri.replace(/^file:\/*/, "/");
}

/** One sample of the transfer-rate window: the byte count and when JS saw it. */
export interface SpeedSample {
  bytes: number;
  at: number;
}

/** Advance the transfer-rate window by one delivery.
 *
 *  Returns the baseline to keep for the next delivery, and the rate to
 *  report (undefined = report nothing, keep whatever was last shown).
 *
 *  Why this exists rather than a raw per-delivery delta: `apply()` is fed
 *  by TWO streams — the 1 s poll AND `onDownloadEvent`, which fires on
 *  every Room write. The same 1 Hz data therefore arrives twice, microseconds
 *  apart, and sampling on every delivery produced a visible 0 -> value -> 0
 *  flicker: a duplicate ~2 ms after the real sample read as a ~32 MB/s
 *  spike, and the next genuine second with no new bytes wrote a hard 0.
 *  ETA inherited it, reading `0 sec` whenever the rate hit zero.
 *
 *  The rules, in order:
 *  - no baseline yet: adopt this one, report nothing;
 *  - byte count unchanged (a duplicate): keep the window OPEN and report
 *    nothing, so the next real advance is measured across the whole span;
 *  - byte count went backwards (a record rewritten after a restart): adopt
 *    the new count as the baseline and report nothing;
 *  - advanced, but inside `minWindowMs`: re-baseline silently — too short a
 *    window is noise, not a rate;
 *  - advanced across a real window: report the rate and re-baseline.
 */
export function nextSpeedSample(
  previous: SpeedSample | undefined,
  bytes: number,
  at: number,
  minWindowMs = 500,
): [SpeedSample, number | undefined] {
  if (previous === undefined) return [{ bytes, at }, undefined];
  if (bytes <= previous.bytes) {
    // A duplicate keeps the old window open; a regression re-bases.
    return bytes === previous.bytes ? [previous, undefined] : [{ bytes, at }, undefined];
  }
  const speed = bytesPerSecond(previous.bytes, previous.at, bytes, at);
  return [{ bytes, at }, speed !== undefined && at - previous.at >= minWindowMs ? speed : undefined];
}

export function latestJobForModel(
  jobs: DownloadJob[],
  modelId: string,
): DownloadJob | undefined {
  let found: DownloadJob | undefined;
  for (const job of jobs) {
    if (job.modelId === modelId) found = job;
  }
  return found;
}
