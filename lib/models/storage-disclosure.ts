/** What a download card SAYS about a model against the device's free space.
 *
 * The rule itself is `modelFitsOnDevice` (lib/storage-fit) — this module
 * only adds the words. Kept pure and separate because the wording is the
 * part a test can pin, and because four surfaces render it identically.
 *
 * Fails closed, like the rule it consumes: an unreadable free space blocks
 * and says so, because a greyed-out button with no reason is the failure
 * this whole change exists to remove.
 */

import { modelFitsOnDevice } from "../storage-fit.ts";
import { formatBytes } from "./progress.ts";

export interface StorageDisclosureInput {
  /** The model file itself. */
  modelBytes: number;
  /** The mmproj, for a vision model; omitted or 0 otherwise. */
  projectorBytes?: number;
  /** null when the read failed — unknown is a block. */
  freeBytes: number | null;
  /** false until the first reading lands: claim nothing, admit nothing. */
  checked?: boolean;
}

export interface StorageDisclosure {
  fits: boolean;
  /** The inline line under the disabled button; null when there is nothing
   *  to say. */
  message: string | null;
}

export function storageDisclosure({
  modelBytes,
  projectorBytes,
  freeBytes,
  checked = true,
}: StorageDisclosureInput): StorageDisclosure {
  const required = modelBytes + (projectorBytes ?? 0);
  if (modelFitsOnDevice({ modelBytes, projectorBytes, freeBytes })) {
    return { fits: true, message: null };
  }
  if (!checked) return { fits: false, message: null };
  // A size that is not a positive finite number cannot be compared against
  // free space, so the shortfall wording would be inventing a figure.
  if (!Number.isFinite(required) || required <= 0) {
    return { fits: false, message: "Couldn't read this model's size — can't check free space" };
  }
  if (freeBytes === null || !Number.isFinite(freeBytes)) {
    return { fits: false, message: "Couldn't read storage — download needs a free-space check" };
  }
  // The reference app's line, verbatim: "Storage low! Model 4.2 GB > 1.1 GB free".
  return {
    fits: false,
    message: `Storage low! Model ${formatBytes(required)} > ${formatBytes(freeBytes)} free`,
  };
}