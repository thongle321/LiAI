import {
  deleteAsync,
  EncodingType,
  readAsStringAsync,
} from "expo-file-system/legacy";

/** One camera snapshot as raw base64 (no data-uri prefix).
 *
 * Shared by the vision tick (hook) and Capture (panel). Times out so a
 * wedged capture can't hang, and always deletes the temp file.
 * VisionCamera returns a bare path; expo-file-system needs a URI.
 */
export async function snapshotToBase64(
  take: () => Promise<{ path: string }>,
): Promise<string> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("snapshot timed out")), 5000);
  });
  const snapshot = await Promise.race([take(), timeout]);
  const uri = snapshot.path.startsWith("file://")
    ? snapshot.path
    : `file://${snapshot.path}`;
  try {
    return await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  } finally {
    await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
