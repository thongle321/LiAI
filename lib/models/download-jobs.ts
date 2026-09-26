/** Latest download job per model (pure, node-tested).
 *
 * The service keeps terminal entries (completed/failed) until replaced, so
 * first-match lookups grab dead jobs — resume then throws "not paused" on
 * a live download. Every lookup goes through here: latest wins.
 */

import type { DownloadJob } from "../../types/models.ts";

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
