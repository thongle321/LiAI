/** Availability rules: the tier gate and the capture-memory matrix. */

import {
  deviceSupportedFor,
  fitsCaptureMemory,
} from "@/services/asr/availability.ts";
import type { DeviceTier } from "@/services/models/device-tiers.ts";

const tiers: DeviceTier[] = [
  { id: "light", label: "Light", minRamMb: 0, blurb: "", presetIds: [] },
  { id: "balanced", label: "Balanced", minRamMb: 4096, blurb: "", presetIds: [] },
  { id: "capable", label: "Capable", minRamMb: 8192, blurb: "", presetIds: [] },
];

// The bundled bundles ship the same three tiers; the constants own the
// "which ids get voice input" verdict (balanced/capable here).
const bundled = undefined; // default tiers come from the asset in prod

describe("deviceSupportedFor (tier gate)", () => {
  it("admits balanced and capable devices", () => {
    expect(deviceSupportedFor(4_294_967_296, tiers)).toBe(true); // 4 GiB
    expect(deviceSupportedFor(8_589_934_592, tiers)).toBe(true); // 8 GiB
  });

  it("denies light devices", () => {
    expect(deviceSupportedFor(2_147_483_648, tiers)).toBe(false); // 2 GiB
  });

  it("fail-closed on unreadable RAM (lightest tier → denied)", () => {
    expect(deviceSupportedFor(null, tiers)).toBe(false);
  });

  it("the bundled tier table admits the same intent (balanced floors)", () => {
    // Call with the REAL bundled default so a future json edit that drops
    // the balanced tier fails here, visibly.
    expect(deviceSupportedFor(4096 * 1024 * 1024, bundled)).toBe(true);
    expect(deviceSupportedFor(2 * 1024 * 1024 * 1024, bundled)).toBe(false);
  });
});

describe("fitsCaptureMemory (PocketParity memory gate)", () => {
  const base = {
    loadedChatBytes: 2_000_000_000,
    runtimeBytes: 650_000_000,
  };

  it("android: whisper + chat model must fit 45% of total RAM", () => {
    // 2.65 GB against 0.45 × 6 GB = 2.7 GB → fits.
    expect(
      fitsCaptureMemory({
        ...base,
        platform: "android",
        totalMemoryBytes: 6_000_000_000,
        androidShare: 0.45,
        iosShare: 0.8,
      }),
    ).toBe(true);
    // Same load against 5 GB → 2.25 GB budget → blocked.
    expect(
      fitsCaptureMemory({
        ...base,
        platform: "android",
        totalMemoryBytes: 5_000_000_000,
        androidShare: 0.45,
        iosShare: 0.8,
      }),
    ).toBe(false);
  });

  it("ios: budgets against the ceiling share (0.8)", () => {
    expect(
      fitsCaptureMemory({
        ...base,
        platform: "ios",
        totalMemoryBytes: 5_000_000_000,
        androidShare: 0.45,
        iosShare: 0.8,
      }),
    ).toBe(true);
  });

  it("whisper runs alone when no chat model is loaded", () => {
    expect(
      fitsCaptureMemory({
        ...base,
        loadedChatBytes: 0,
        platform: "android",
        totalMemoryBytes: 2_000_000_000,
        androidShare: 0.45,
        iosShare: 0.8,
      }),
    ).toBe(true);
  });

  it("unreadable RAM stays permissive (tier floor, not a wall)", () => {
    expect(
      fitsCaptureMemory({
        ...base,
        platform: "android",
        totalMemoryBytes: null,
        androidShare: 0.45,
        iosShare: 0.8,
      }),
    ).toBe(true);
  });
});
