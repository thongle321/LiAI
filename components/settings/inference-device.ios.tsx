/** iOS accelerators.
 *
 * Metal is always present and no Hexagon DSP exists, so the answer is known
 * before the first render — there is nothing to query and therefore no window
 * in which the card reads CPU-only, which is the flash the Android branch has
 * to live with.
 */

import type { DeviceAccelerators } from "./inference-device";

const IOS_ACCELERATORS: DeviceAccelerators = { hasHexagon: false, hasGpu: true };

export function useDeviceAccelerators(): DeviceAccelerators | null {
  return IOS_ACCELERATORS;
}

/** Repacking is llama.rn's Android path; iOS has no equivalent. */
export const SHOWS_WEIGHT_REPACKING = false;
