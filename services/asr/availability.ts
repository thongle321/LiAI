/** ASR availability + capture-memory gates (PocketParity ASRStore).
 *
 * The availability gate is the single boolean every ASR-aware surface
 * reads: a device-tier default × a persisted user override. Our tier
 * vocabulary has no "high"/"flagship" ids — the reference app's mapping
 * `ASR_DEVICE_TIERS` rides OUR ids (balanced/capable, i.e. ≥4 GiB), which
 * the constants file owns. Pure rules here; IO sits in the store.
 */

import tiersJson from "@/assets/device-tiers.json";
import { ASR_DEVICE_TIERS } from "./constants.ts";
import type { AsrTier, AsrTierManifest } from "./types.ts";
import {
  matchTier,
  parseTiers,
  type DeviceTier,
} from "@/services/models/device-tiers.ts";

/** Tiers whose floor lets a whisper model breathe next to a chat model.
 *  voice input is a heavyweight feature; the bundled floor applies. */
export const ParsedTiers: DeviceTier[] = parseTiers(tiersJson);

/** True when the device's tier clears the ASR bar. Pure; the store feeds
 *  the RAM reading (and tests inject one), so IO lives at the call site.
 *  Unreadable RAM falls to the lightest tier — fail-closed, like the
 *  bundled floor itself. */
export function deviceSupportedFor(
  totalMemoryBytes: number | null,
  tiers: DeviceTier[] = ParsedTiers,
): boolean {
  const tier = matchTier(totalMemoryBytes, tiers);
  return (ASR_DEVICE_TIERS as readonly string[]).includes(tier.id);
}

/** PocketParity hasMemoryForCapture: whisper must fit NEXT TO the loaded
 *  chat model. Android budgets against TOTAL RAM (its free-memory figure
 *  is untrustworthy); iOS against the ceiling share. Pure so the matrix
 *  is testable — the store supplies the numbers. */
export function fitsCaptureMemory(args: {
  platform: "ios" | "android";
  totalMemoryBytes: number | null;
  loadedChatBytes: number;
  runtimeBytes: number;
  androidShare: number;
  iosShare: number;
}): boolean {
  const {
    platform,
    totalMemoryBytes,
    loadedChatBytes,
    runtimeBytes,
    androidShare,
    iosShare,
  } = args;
  if (totalMemoryBytes === null) return true;
  const share = platform === "ios" ? iosShare : androidShare;
  return loadedChatBytes + runtimeBytes <= totalMemoryBytes * share;
}

/** The active (local) model's bytes, read lazily so plain-Node tests of
 *  this module never pull the model store — and the store never pulls
 *  llama.rn. 0 when nothing local is active (PocketPal's `?? 0`). */
export async function activeChatModelBytes(): Promise<number> {
  try {
    const { useModelStore } = await import("@/store/model-store.ts");
    const m = useModelStore.getState();
    if (m.activeProviderType !== "local" || m.activeModelId === null) {
      return 0;
    }
    const model = m.models.find((x) => x.id === m.activeModelId);
    return model && model.downloadStatus === "completed"
      ? model.totalBytes
      : 0;
  } catch {
    return 0;
  }
}

export type { AsrTier, AsrTierManifest };
