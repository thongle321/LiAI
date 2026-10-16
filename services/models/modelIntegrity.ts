/** On-disk integrity for a downloaded model file, ported from PocketPal's
 * checkModelFileIntegrity (utils/index.ts): size comparison with 0.1%
 * tolerance — their SHA path proved unreliable and expensive, same call
 * here. expo-file-system stays behind a dynamic import so jest
 * never touches native code (deviceSelection.ts precedent). Returns
 * data, not words: the component composes the message with ModelBits
 * formatBytes (lib must not reach into components for copy).
 */

export interface IntegrityResult {
  isValid: boolean;
  exists: boolean;
  actualBytes: number | null;
  expectedBytes: number | null;
}

export async function checkModelFileIntegrity(
  localPath: string,
  expectedBytes?: number,
): Promise<IntegrityResult> {
  try {
    const { getInfoAsync } = await import("expo-file-system/legacy");
    // No options: size is returned by default (InfoOptions only adds md5).
    const info = await getInfoAsync(localPath);
    if (!info.exists) {
      return {
        isValid: false,
        exists: false,
        actualBytes: null,
        expectedBytes: expectedBytes ?? null,
      };
    }
    const actual = info.size ?? 0;
    if (expectedBytes && expectedBytes > 0) {
      const diff = Math.abs(actual - expectedBytes) / expectedBytes;
      if (diff > 0.001) {
        return { isValid: false, exists: true, actualBytes: actual, expectedBytes };
      }
    }
    return {
      isValid: true,
      exists: true,
      actualBytes: actual,
      expectedBytes: expectedBytes ?? null,
    };
  } catch {
    // A stat failure is not evidence of corruption (the load path
    // reports real IO errors) — never accuse without a measurement.
    return {
      isValid: true,
      exists: true,
      actualBytes: null,
      expectedBytes: expectedBytes ?? null,
    };
  }
}
