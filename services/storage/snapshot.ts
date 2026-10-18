/** One camera snapshot as a `file://` URI to a cached JPEG.
 *
 * Shared by the vision tick (hook) and Capture (panel). Times out so a
 * wedged capture can't hang. VisionCamera returns a bare path;
 * expo-file-system - and llama's `media_paths` - want a URI.
 *
 * The file stays where the camera put it. It IS the attachment now, not a
 * staging copy of one: the turn hands this URI to the engine and the
 * message history renders it as the turn's thumbnail, so deleting it here
 * would blank a photo the user can still see (D5-4). The cache directory
 * is the OS's to reclaim, exactly as it is for the reference app.
 */
export async function snapshotToUri(
  take: () => Promise<{ path: string }>,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("snapshot timed out")), 5000);
  });
  try {
    const snapshot = await Promise.race([take(), timeout]);
    return snapshot.path.startsWith("file://")
      ? snapshot.path
      : `file://${snapshot.path}`;
  } finally {
    if (timer) clearTimeout(timer);
  }
}