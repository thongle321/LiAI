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
