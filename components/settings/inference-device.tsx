/** Device-accelerator contract + Metro fallback.
 *
 * Metro resolves `./inference-device` to `inference-device.ios.tsx` on iOS and
 * `inference-device.android.tsx` on Android; nothing on device ever runs this
 * file. It exists so `tsc` (which does not understand platform extensions) has
 * something to resolve, and so both implementations share one interface — a
 * member added here must be honoured by both platform files.
 *
 * WHY A SEAM AT ALL. The settings card branched on `Platform.OS` in four
 * places, which `AGENTS.md` forbids: each branch was invisible to a reviewer
 * reading either platform. What actually differs is narrow — whether the
 * device has to be ASKED, and whether the memory card offers Weight
 * Repacking — so that is all this seam carries; the rows themselves stay in
 * one place.
 *
 * The fallback below is the CONSERVATIVE answer, not a copy of either
 * platform: unknown hardware is promised nothing. That is the same direction
 * the Android implementation takes while its query is in flight.
 */

/** What the phone reports about its accelerators, or null while unresolved. */
export interface DeviceAccelerators {
  hasHexagon: boolean;
  hasGpu: boolean;
}

/** The resolved accelerators, or null until the device has answered. */
export function useDeviceAccelerators(): DeviceAccelerators | null {
  return { hasHexagon: false, hasGpu: false };
}

/** Whether the memory card offers Weight Repacking — llama.rn's repacking
 *  path is the Android one, so iOS has no equivalent row. */
export const SHOWS_WEIGHT_REPACKING = false;
