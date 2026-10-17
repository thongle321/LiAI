/** In-chat image attach: picker seam over expo-image-picker.
 *
 * A turn may carry several photos (G8): `send(text, images?)` feeds a
 * multimodal turn whose `imagePaths` the engine already accepted as an
 * array. This module owns the native picker calls so the UI stays
 * declarative and node tests inject a fake launcher.
 */

export type ImageSource = "camera" | "gallery";

/** Structural slice of expo-image-picker the seam touches (fakes satisfy it). */
export interface ImageLauncher {
  getCameraPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  getMediaLibraryPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestCameraPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  launchCameraAsync(options: Record<string, unknown>): Promise<ImagePickResult>;
  launchImageLibraryAsync(options: Record<string, unknown>): Promise<ImagePickResult>;
}

export interface ImagePickResult {
  canceled: boolean;
  assets?: Array<{ base64?: string; mimeType?: string }>;
}

async function defaultLauncher(): Promise<ImageLauncher> {
  // SAFETY: expo-image-picker's real module shape is a superset of the
  // structural ImageLauncher slice (same method names/signatures).
  return (await import("expo-image-picker")) as unknown as ImageLauncher;
}

/** Attached photos travel as `data:<mime>;base64,<payload>`. */
export function toDataUri(base64: string, mime: string | undefined): string {
  return `data:${mime ?? "image/jpeg"};base64,${base64}`;
}

/** Photo permission gate (mirrors ensureMicAccess): a permanent denial
 *  never pops up again, so route to Settings instead of silently no-oping. */
export type PhotoAccess = "granted" | "settings" | "unavailable";
export async function ensurePhotoAccess(
  source: ImageSource,
  launcher: ImageLauncher,
): Promise<PhotoAccess> {
  try {
    const current =
      source === "camera"
        ? await launcher.getCameraPermissionsAsync()
        : await launcher.getMediaLibraryPermissionsAsync();
    if (current.granted) return "granted";
    if (!current.canAskAgain) return "settings";
    const res =
      source === "camera"
        ? await launcher.requestCameraPermissionsAsync()
        : await launcher.requestMediaLibraryPermissionsAsync();
    return res.granted ? "granted" : "settings";
  } catch {
    return "unavailable";
  }
}

// ponytail: quality 0.7 keeps a 12MP shot in the low single-digit MBs;
// full-resolution base64 would balloon the JSON chat body.
const PICKER_OPTS = { mediaTypes: ["images"], base64: true, quality: 0.7 } as const;

/** How many photos one turn may carry. PocketPal's gallery
 *  `selectionLimit` (ChatInput.tsx:320). */
export const MAX_IMAGES = 5;

/** Data-uris for the picked photos; EMPTY (not null) on cancel, denial, or
 *  an empty payload.
 *
 *  The camera yields exactly one shot; the gallery asks for up to
 *  MAX_IMAGES. The list is also truncated HERE rather than trusting the
 *  platform to honour `selectionLimit` -- it is advisory, and an
 *  unbounded attach is a multi-megabyte base64 body the model never
 *  wanted. */
export async function pickImages(
  source: ImageSource,
  launcher?: ImageLauncher,
): Promise<string[]> {
  const mod = launcher ?? (await defaultLauncher());
  const access = await ensurePhotoAccess(source, mod);
  if (access === "settings") {
    // Permanent denial: the OS won't prompt again, so take the user to
    // the only place that can unblock them (D5-9).
    void (await import("expo-linking")).openSettings().catch(() => {});
    return [];
  }
  if (access !== "granted") return [];
  const result =
    source === "camera"
      ? await mod.launchCameraAsync({ ...PICKER_OPTS })
      : await mod.launchImageLibraryAsync({
          ...PICKER_OPTS,
          selectionLimit: MAX_IMAGES,
        });
  if (result.canceled) return [];
  const uris: string[] = [];
  for (const asset of result.assets ?? []) {
    if (uris.length >= MAX_IMAGES) break;
    if (asset.base64 === undefined || asset.base64 === "") continue;
    uris.push(toDataUri(asset.base64, asset.mimeType));
  }
  return uris;
}
