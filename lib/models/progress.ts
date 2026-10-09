/** Download progress display: percent clamping, byte formatting, ETA.
 *
 * `formatBytes` and the ETA math are ports of PocketPal's progress maths so
 * the two apps read identically to a user: `src/utils/formatters.ts:16-41`
 * and the live listener at `services/downloads/DownloadManager.ts:88-120`.
 *
 * There is no hours branch, so a slow transfer renders a large number of
 * minutes. Both kept deliberately — see the note on `progressCaption`.
 */
const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
const DECIMAL_UNITS = ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

/** A download's progress as a whole percent in 0-100.
 *
 *  Raw `downloadProgress` is not safe to render: `setModelProgress`
 *  (store/models/catalog.ts:270) can hand out a value derived from a
 *  re-stat mid-reconcile, and a bar sized at 104% or a label reading "-2%"
 *  is a visible bug rather than a rounding detail.
 */
export function clampPercent(progress: number): number {
  return Math.min(100, Math.max(0, progress));
}

/** Human-readable byte count. Decimal base 1000 unless told otherwise. */
export function formatBytes(
  size: number,
  fractionDigits = 2,
  useBinary = false,
  threeDigits = false,
): string {
  if (size <= 0) return "0 B";

  const base = useBinary ? 1024 : 1000;
  const multiple = Math.floor(Math.log(size) / Math.log(base));
  const units = useBinary ? BINARY_UNITS : DECIMAL_UNITS;
  const value = size / Math.pow(base, multiple);

  if (threeDigits) {
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toFixed(digits) + " " + units[multiple];
  }

  return parseFloat(value.toFixed(fractionDigits)) + " " + units[multiple];
}

/** Time left, rounded up, in whole minutes past a minute and seconds below.
 *
 *  `speedBytesPerSec` is our own smoothed figure (trackSpeed in
 *  download-service.ts), not the reference's raw per-tick delta — the same
 *  jitter made its ETA flash "0 sec" on any stalled tick. A dead speed reads
 *  "0 sec" rather than dividing by zero.
 */
export function formatEta(remainingBytes: number, speedBytesPerSec: number): string {
  const seconds = speedBytesPerSec > 0 ? remainingBytes / speedBytesPerSec : 0;
  return seconds >= 60
    ? `${Math.ceil(seconds / 60)} min`
    : `${Math.ceil(seconds)} sec`;
}

/** The one-line caption under a progress bar.
 *
 *  `1.05 MB (5.42 MB/s) ETA: 4 min` — PocketPal's model-card string
 *  (screens/ModelsScreen/ModelCard/ModelCard.tsx:798-813, assembled at
 *  store/ModelStore.ts:300). No percentage: the reference shows none, and the
 *  byte count plus the bar already carry it.
 *
 *  One unit base for both figures: the byte string and the speed label both
 *  divide by 1000. The reference mixed bases (speed by 1024, bytes by 1000),
 *  so one line read `1.05 MB (5.42 MB/s)` — numbers ~5% apart on the same
 *  line. Byte formatting itself stays decimal.
 *
 *  The hours branch stays absent: the reference has none, and matching its
 *  output verbatim is the goal.
 *
 *  The one place this is NOT verbatim: remaining bytes are clamped at zero.
 *  The reference would render `ETA: -3 sec` when a re-stat reports more bytes
 *  on disk than the transfer believes it wrote. Clamped.
 */
export function progressCaption(
  downloadedBytes: number,
  totalBytes: number,
  speedBytesPerSec: number,
): string {
  const speedMBps = (speedBytesPerSec / 1000 / 1000).toFixed(2);
  return `${formatBytes(downloadedBytes)} (${speedMBps} MB/s) ETA: ${formatEta(
    Math.max(0, totalBytes - downloadedBytes),
    speedBytesPerSec,
  )}`;
}