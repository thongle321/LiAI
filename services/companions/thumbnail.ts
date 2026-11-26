/** Thumbnail handling for companion import/export (PocketPal's imageUtils).
 *
 *  Local thumbnails are embedded as base64 data URIs on export; remote
 *  URLs pass through. On import, base64 data is written to the cache
 *  directory and the companion stores a file:// URI.
 *
 *  PocketPal parity (pathGuard/imageUtils #1012): the file NAME derived
 *  from an import is validated with `isSafePathSegment` before any write,
 *  `thumbnail_url` values are allowlisted on import (only remote URLs
 *  survive), and `readThumbnailAsBase64` refuses URIs outside our own
 *  thumbnail directory. A hostile backup must not write outside the
 *  directory or read an arbitrary file into an export.
 */

import {
  documentDirectory,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import { isSafePathSegment } from "@/utils/path-guard.ts";

export const THUMBNAIL_DIR = "companion-thumbnails";

export function isLocalThumbnailPath(url: string): boolean {
  return !url.startsWith("http://") && !url.startsWith("https://");
}

export function isRemoteThumbnailUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/** Import keeps a remote thumbnail URL only (PocketPal's keepRemoteThumbnailUrl):
 *  a local `file://` URL in a hostile backup is dropped — the bytes (if any)
 *  are restored instead through `thumbnail_data`. */
export function keepRemoteThumbnailUrl(url: unknown): string | undefined {
  return typeof url === "string" && isRemoteThumbnailUrl(url) ? url : undefined;
}

export async function saveBase64Image(
  base64Data: string,
  companionId: string,
): Promise<string | null> {
  const match = base64Data.match(/^data:image\/([^;]+);base64,(.+)$/);
  if (!match) return null;
  const [, ext, b64] = match;
  const filename = `${companionId}_thumbnail.${ext}`;
  // PocketPal parity: a name derived from an import must be a plain
  // segment before any write — `../../evil` or a traversal ext is refused.
  if (!isSafePathSegment(filename)) return null;
  try {
    const dir = `${documentDirectory ?? ""}${THUMBNAIL_DIR}`;
    await makeDirectoryAsync(dir, { intermediates: true });
    const path = `${dir}/${filename}`;
    await writeAsStringAsync(path, b64, { encoding: "base64" });
    // documentDirectory already carries the file:// scheme; adding one
    // more produced `file://file:///...` URIs no reader accepts.
    return path.startsWith("file://") ? path : `file://${path}`;
  } catch {
    return null;
  }
}

/** Reads file contents as base64 into data URI. Only files inside our own
 *  thumbnail directory are readable — an arbitrary file:// URI must not
 *  be exfiltrated into an export. */
export async function readThumbnailAsBase64(fileUri: string): Promise<string | null> {
  if (typeof fileUri !== "string" || !fileUri.startsWith("file://")) return null;
  // The ownership check runs against the device root. A missing root
  // fails closed rather than reading an unvetted path.
  const owned = `${documentDirectory ?? ""}${THUMBNAIL_DIR}/`;
  if (!fileUri.startsWith(owned)) return null;
  const filename = fileUri.slice(owned.length);
  if (!isSafePathSegment(filename)) return null;
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
