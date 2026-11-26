/** Chat-image URI allowlist (PocketPal's chatImageUri.ts, adapted).
 *
 * An imported backup is untrusted: its `images` entries are URIs the UI
 * will render and the engine will read. PocketPal allows only image-picker
 * temp files. Here the FS roots arrive as parameters so this module stays
 * pure — the caller supplies expo-file-system's `cacheDirectory`.
 *
 * Without roots, only the shape is checked (scheme, no traversal, no
 * control characters); the legacy `file://name.jpg` test fixtures and old
 * exports keep validating. With a cache root, containment is enforced. */

import { isSafePathSegment } from "./path-guard.ts";

const FILE_SCHEME = "file://";

/** Directory roots a chat image may live under, as expo-file-system
 *  directory URIs (trailing slash included). */
export interface ChatImageRoots {
  cacheDirectory?: string;
}

/** Checks one `images` entry from an imported backup. */
export function isAllowedChatImageUri(
  uri: unknown,
  roots?: ChatImageRoots,
): boolean {
  if (typeof uri !== "string" || !uri.startsWith(FILE_SCHEME)) {
    return false;
  }
  const path = uri.slice(FILE_SCHEME.length);
  if (path.length === 0) {
    return false;
  }
  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return false;
  }
  if (!segments.every((s) => isSafePathSegment(s))) {
    return false;
  }
  const cacheDirectory = roots?.cacheDirectory;
  if (cacheDirectory === undefined) {
    return true;
  }
  // Containment: normalize both sides to raw paths. The root carries the
  // file:// scheme; the candidate's path above does not.
  const rootPath = cacheDirectory.startsWith(FILE_SCHEME)
    ? cacheDirectory.slice(FILE_SCHEME.length).replace(/\/+$/, "")
    : cacheDirectory.replace(/\/+$/, "");
  return path.startsWith(`${rootPath}/`);
}
