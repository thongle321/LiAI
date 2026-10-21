/** Continuous free-space reading for the download surfaces.
 *
 * Free space used to be read once when the preset accordion opened, which is
 * stale by the time the user decides — and was applied to one card type. The
 * reading is polled while the card is on screen instead, so freeing space
 * re-enables the Download button with no remount and no app restart.
 *
 * The decision itself is `storageDisclosure` (services/models), which consumes the
 * storage-fit rule; this hook owns the I/O and the interval only.
 */

import { useEffect, useState } from "react";
import { Paths } from "expo-file-system";

import { storageDisclosure, type StorageDisclosure } from "@/services/models/storage-disclosure.ts";

/** Fast enough that freeing space shows up while the user is still looking
 *  at the card, slow enough not to ask the filesystem the same question
 *  every frame. */
const POLL_MS = 15_000;

export interface FreeSpaceReading {
  freeBytes: number | null;
  /** false until the first read resolves: nothing has been claimed yet. */
  checked: boolean;
}

/** Poll free space while `active`. A failed read is a null reading, which
 *  the decision treats as a block — and the interval keeps trying, so a
 *  transient failure clears itself. */
export function useFreeSpacePoll(active: boolean): FreeSpaceReading {
  const [reading, setReading] = useState<FreeSpaceReading>({
    freeBytes: null,
    checked: false,
  });

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = () => {
      try {
        const free = Paths.availableDiskSpace;
        if (alive) setReading({ freeBytes: free, checked: true });
      } catch {
        if (alive) setReading({ freeBytes: null, checked: true });
      }
    };
    read();
    const timer = setInterval(read, POLL_MS);
    // Without this the timer outlives the card: a list that scrolls its
    // cards away would keep reading the disk forever.
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active]);

  return reading;
}

/** Does this model fit right now, and what should the card say about it?
 *
 * `modelBytes` null means the card has no Download button (a ready model),
 * so nothing is checked and nothing is claimed. */
export function useStorageDisclosure(
  modelBytes: number | null,
  projectorBytes = 0,
): StorageDisclosure {
  const { freeBytes, checked } = useFreeSpacePoll(modelBytes !== null);
  if (modelBytes === null) return { fits: true, message: null };
  return storageDisclosure({ modelBytes, projectorBytes, freeBytes, checked });
}
