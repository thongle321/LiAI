/** Device-tier presets: bundled static JSON, display-only, no online fetch.
 *
 * The JSON asset (assets/device-tiers.json) is the source of truth; this
 * module owns the shape guard, the RAM matcher (both pure, tested), and
 * the lazy device reader. App screens import the JSON plainly (Metro
 * bundles it) and parse it once through parseTiers.
 */

export interface DeviceTier {
  id: string;
  label: string;
  minRamMb: number;
  blurb: string;
  presetIds: string[];
}

/** Validated tiers from a JSON payload; throws on a corrupt bundle. */
export function parseTiers(data: unknown): DeviceTier[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("device tiers missing or empty");
  }
  return data.map((row, index) => {
    if (
      row === null ||
      typeof row !== "object" ||
      typeof (row as Record<string, unknown>).id !== "string" ||
      typeof (row as Record<string, unknown>).label !== "string" ||
      typeof (row as Record<string, unknown>).minRamMb !== "number" ||
      typeof (row as Record<string, unknown>).blurb !== "string" ||
      !Array.isArray((row as Record<string, unknown>).presetIds)
    ) {
      throw new Error(`device tier ${index} malformed`);
    }
    return row as DeviceTier;
  });
}

/** Highest tier whose floor fits, lightest when memory is unknown. */
export function matchTier(
  totalMemoryBytes: number | null,
  tiers: DeviceTier[],
): DeviceTier {
  if (totalMemoryBytes === null || totalMemoryBytes < 0) return tiers[0];
  // RAM is binary: a marketed "4GB" phone reports 4GiB, and decimal MB
  // would understate it ~7% — enough to miss a boundary from below.
  const mib = totalMemoryBytes / (1024 * 1024);
  let best = tiers[0];
  for (const tier of tiers) {
    if (tier.minRamMb <= mib) best = tier;
  }
  return best;
}

/** Device RAM in bytes, or null when unreadable (lazy native import). */
export async function readTotalMemory(): Promise<number | null> {
  try {
    const { totalMemory } = await import("expo-device");
    return typeof totalMemory === "number" ? totalMemory : null;
  } catch {
    return null;
  }
}
