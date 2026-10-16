import type { NativeBackendDeviceInfo } from "llama.rn";

/** Compute-device selection, ported from PocketPal's
 * `pocketpal-ai/src/utils/deviceSelection.ts` selection rules: the UI
 * gates and the init patch follow what the phone actually reports via
 * `getBackendDevicesInfo()`, never the platform alone. Everything here
 * takes the device list as an argument, so jest never touches
 * native code (llama.rn is imported dynamically, inside the one async
 * function that needs it).
 */

export function selectHexagonDevice(
  devices: NativeBackendDeviceInfo[],
): NativeBackendDeviceInfo | undefined {
  // Names carrying * or ? are llama.cpp wildcard/disabled entries, not
  // hardware — PocketPal rejects them for the same reason.
  return devices.find(
    (d) => d.deviceName?.startsWith("HTP") && !/[*?]/.test(d.deviceName),
  );
}

export function selectGpuDevice(
  devices: NativeBackendDeviceInfo[],
): NativeBackendDeviceInfo | undefined {
  return devices.find((d) => d.type === "gpu");
}

export function getDeviceAvailability(
  devices: NativeBackendDeviceInfo[],
): { hasHexagon: boolean; hasGpu: boolean } {
  return {
    hasHexagon: selectHexagonDevice(devices) !== undefined,
    hasGpu: selectGpuDevice(devices) !== undefined,
  };
}

/** The device-related init patch. A real HTP name only when opted in
 * AND present; otherwise `devices` stays undefined (omitted downstream —
 * llama.rn reads a missing `devices` as platform default). The raw
 * "HTP*" wildcard is never passed through. No GPU hardware means no
 * offload: PocketPal's CPU-option semantics (n_gpu_layers 0). */
export function resolveComputeDevices(
  useHexagonNpu: boolean,
  sliderGpuLayers: number,
  devices: NativeBackendDeviceInfo[],
): { devices: string[] | undefined; nGpuLayers: number } {
  const hexagon = useHexagonNpu ? selectHexagonDevice(devices) : undefined;
  // Offload follows the resolved compute path: the NPU path carries the
  // slider value, the GPU path carries it only where a GPU exists, and
  // CPU-only phones init n_gpu_layers 0 (PocketPal's CPU semantics).
  const accelerated = hexagon ?? selectGpuDevice(devices);
  return {
    devices: hexagon ? [hexagon.deviceName] : undefined,
    nGpuLayers: accelerated ? sliderGpuLayers : 0,
  };
}

/** Thin async query over the native backend list. Never throws: an
 * unavailable native module means "no accelerators", not a crash. */
export async function getAvailableDevices(): Promise<
  NativeBackendDeviceInfo[]
> {
  try {
    const { getBackendDevicesInfo } = await import("llama.rn");
    return (await getBackendDevicesInfo()) ?? [];
  } catch {
    return [];
  }
}
