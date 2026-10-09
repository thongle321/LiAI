/** What the Settings storage row SAYS for a given free-space reading.
 *
 * Pure seam: the read itself is native (`getFreeDiskStorageAsync`) and can
 * fail, so this takes the reading — or `null` for "could not be read" — and
 * returns the row's value. Formatting goes through `formatBytes` (issue 07
 * fixes that base) so a free-space figure reads exactly like the byte
 * figure on a download card.
 */

import { formatBytes } from "./progress.ts";

export function freeSpaceLabel(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
    return "Couldn't read storage";
  }
  return `${formatBytes(bytes)} free`;
}
