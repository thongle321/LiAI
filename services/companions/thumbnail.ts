/** Thumbnail handling for companion import/export (PocketPal's imageUtils).
 *
 *  Local thumbnails are embedded as base64 data URIs on export; remote
 *  URLs pass through. On import, base64 data is written to the cache
 *  directory and the companion stores a file:// URI.
 */

import { readAsStringAsync } from "expo-file-system/legacy";

export const THUMBNAIL_DIR = "companion-thumbnails";

export function isLocalThumbnailPath(url: string): boolean {
  return !url.startsWith("http://") && !url.startsWith("https://");
}

export function isRemoteThumbnailUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export async function saveBase64Image(
  base64Data: string,
  companionId: string,
): Promise<string | null> {
  try {
    const FS = await import("expo-file-system/legacy");
    const match = base64Data.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!match) return null;
    const [, ext, b64] = match;
    const filename = `${companionId}_thumbnail.${ext}`;
    const dir = `${FS.documentDirectory ?? ""}${THUMBNAIL_DIR}`;
    await FS.makeDirectoryAsync(dir, { intermediates: true });
    const path = `${dir}/${filename}`;
    await FS.writeAsStringAsync(path, b64, { encoding: "base64" });
    return `file://${path}`;
  } catch {
    return null;
  }
}

export async function readThumbnailAsBase64(fileUri: string): Promise<string | null> {
  try {
    const content = await readAsStringAsync(fileUri, { encoding: "base64" });
    const ext = fileUri.split(".").pop() ?? "png";
    return `data:image/${ext};base64,${content}`;
  } catch {
    return null;
  }
}

export function thumbnailExportPayload(
  url: string | undefined,
): { thumbnail_url?: string; thumbnail_data?: string } {
  if (!url) return {};
  if (isLocalThumbnailPath(url)) {
    // For export, we'd read the file and embed as base64
    // This is async so the caller must await readThumbnailAsBase64
    return { thumbnail_url: undefined, thumbnail_data: "DEFERRED" };
  }
  return { thumbnail_url: url };
}