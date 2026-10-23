/** Interrupted-download resume state.
 *
 * When Android kills the app mid-download the partial GGUF survives on
 * disk. Handing its byte length back to the legacy downloader as resumeData
 * makes the native layer send `Range: bytes=N-` and append — the Expo
 * equivalent of PocketPal's worker resume. Pure, so it stays tested
 * without a native seam.
 */

/** Suffix of the native worker's staging file: in-flight bytes land at
 *  `destination + PART_SUFFIX` and the final file appears atomically when
 *  the transfer commits (DownloadWorker.kt). Anything outside the module
 *  that reads download artifacts must look at BOTH paths. */
export const PART_SUFFIX = ".part";

/** Resume token for a partial file, or null when a fresh start is correct. */
export function resumeDataForPartial(
  partialBytes: number,
  totalBytes: number,
): string | null {
  if (!Number.isFinite(partialBytes) || !Number.isFinite(totalBytes)) return null;
  if (partialBytes <= 0 || totalBytes <= 0) return null;
  if (partialBytes >= totalBytes) return null;
  return String(Math.floor(partialBytes));
}

/** What a file on disk means, given what the Hub says it should be.
 *
 * The overshoot case is the one that used to fall through every branch:
 * a file LARGER than expected is the fingerprint of an error body appended
 * onto a partial by the native writer, which never checks the status
 * (FileSystemLegacyModule.kt:920-931). It is not resumable (there is
 * nothing left to extend) and not complete, so it needs deleting rather
 * than either reading or offering Resume.
 *
 * "unknown" covers the inputs we cannot judge — an unknown expected size,
 * or a stat we could not trust. Callers leave the row alone on unknown;
 * acting on a guess is how a good file gets deleted. */
export type DiskState = "complete" | "partial" | "corrupt" | "absent" | "unknown";

export function classifyFileOnDisk(
  sizeBytes: number,
  totalBytes: number,
): DiskState {
  if (!Number.isFinite(sizeBytes) || !Number.isFinite(totalBytes)) return "unknown";
  if (totalBytes <= 0) return "unknown";
  if (sizeBytes === totalBytes) return "complete";
  if (sizeBytes > totalBytes) return "corrupt";
  if (sizeBytes > 0) return "partial";
  return "absent";
}
