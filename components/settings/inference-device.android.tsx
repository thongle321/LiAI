/** Android accelerators: the phone has to be ASKED.
 *
 * Returns null until the device answers (see `deviceSelection.ts`). The card
 * reads CPU-only in the meantime rather than promising hardware that may not
 * be there — PocketPal's direction, and the reason this hook's return type is
 * nullable.
 */

import { useEffect, useState } from "react";

import type { DeviceAccelerators } from "./inference-device";
import {
  getAvailableDevices,
  getDeviceAvailability,
} from "@/services/inference/deviceSelection.ts";

export function useDeviceAccelerators(): DeviceAccelerators | null {
  const [accelerators, setAccelerators] = useState<DeviceAccelerators | null>(null);

  useEffect(() => {
    // `live` guards the unmount: the query resolves after the user may have
    // left the screen, and setting state there is a leak, not a no-op.
    let live = true;
    void getAvailableDevices().then((devices) => {
      if (live) setAccelerators(getDeviceAvailability(devices));
    });
    return () => {
      live = false;
    };
  }, []);

  return accelerators;
}

export const SHOWS_WEIGHT_REPACKING = true;
