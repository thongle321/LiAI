/** Storage-fit: does a model fit on the device's free space?
 *
 * No filesystem here — the reading is passed in — so the rule is a total
 * function over numbers that jest can exercise directly.
 * Fails closed: an unreadable free-space figure blocks the download, because
 * a transfer that runs out reports its own failure while a permanently
 * disabled button explains nothing.
 */

export interface StorageFitInput {
  /** The model file itself. */
  modelBytes: number;
  /** The mmproj, for a vision model; omitted or 0 otherwise. */
  projectorBytes?: number;
  /** null when the free-space read failed — unknown is a block. */
  freeBytes: number | null;
}

export function modelFitsOnDevice({ modelBytes, projectorBytes, freeBytes }: StorageFitInput): boolean {
  if (freeBytes === null || !Number.isFinite(freeBytes)) return false;
  const required = modelBytes + (projectorBytes ?? 0);
  if (!Number.isFinite(required) || required <= 0) return false;
  return required <= freeBytes;
}
