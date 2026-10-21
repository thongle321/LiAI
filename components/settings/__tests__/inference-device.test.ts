/** The platform seam resolves.
 *
 * Metro picks `inference-device.ios.tsx` on iOS and `.android.tsx` on Android,
 * but only for an extension-less specifier (see the guard in
 * `jest/architecture-conventions.test.ts` for why the extensioned form is the
 * trap it is). This suite pins the other end of that: that importing the pair
 * by NAME actually yields a variant rather than the shared contract file.
 *
 * jest-expo sets `haste.defaultPlatform: "ios"`, so the expectation here is
 * the iOS contract. That is the point — if the import ever loses its platform
 * resolution, the shared fallback answers instead, and the fallback is
 * deliberately the CONSERVATIVE hardware claim (no GPU) rather than a copy of
 * either platform. The first assertion fails loudly in that case.
 */

import { renderHook } from "@testing-library/react-native";

import { SHOWS_WEIGHT_REPACKING, useDeviceAccelerators } from "../inference-device";

describe("inference-device", () => {
  it("resolves the iOS variant, not the shared fallback", () => {
    const { result } = renderHook(() => useDeviceAccelerators());
    expect(result.current).toEqual({ hasHexagon: false, hasGpu: true });
  });

  it("hides the Weight Repacking row on iOS", () => {
    // llama.rn's repacking path is the Android one.
    expect(SHOWS_WEIGHT_REPACKING).toBe(false);
  });
});
