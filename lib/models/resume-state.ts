/** Interrupted-download resume state.
 *
 * When Android kills the app mid-download the partial GGUF survives on
 * disk. Handing its byte length back to the legacy downloader as resumeData
 * makes the native layer send `Range: bytes=N-` and append — the Expo
 * equivalent of PocketPal's worker resume. Pure, so it stays tested
 * without a native seam.
 */

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
