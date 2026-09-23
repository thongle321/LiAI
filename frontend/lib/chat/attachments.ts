/** In-chat image attach: picker seam over expo-image-picker.
 *
 * The store and backend already accept one image per turn
 * (`send(text, image?)` → `ChatRequest.image` data-uri); the composer had
 * no way to supply one. This module owns the native picker calls so the
 * UI stays declarative and node tests inject a fake launcher.
 */

export type ImageSource = "camera" | "gallery";

/** Structural slice of expo-image-picker the seam touches (fakes satisfy it). */
export interface ImageLauncher {
  requestCameraPermissionsAsync(): Promise<{ status: string }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ status: string }>;
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

/** Backend image path takes `data:<mime>;base64,<payload>`. */
export function toDataUri(base64: string, mime: string | undefined): string {
  return `data:${mime ?? "image/jpeg"};base64,${base64}`;
}

/** True when the OS grants photo access (mirrors ensureMicAccess). */
export async function ensurePhotoAccess(
  source: ImageSource,
  launcher: ImageLauncher,
): Promise<boolean> {
  const { status } =
    source === "camera"
      ? await launcher.requestCameraPermissionsAsync()
      : await launcher.requestMediaLibraryPermissionsAsync();
  return status === "granted";
}

// ponytail: quality 0.7 keeps a 12MP shot in the low single-digit MBs;
// full-resolution base64 would balloon the JSON chat body.
const PICKER_OPTS = { mediaTypes: ["images"], base64: true, quality: 0.7 } as const;

/** Data-uri for the picked shot, or null on cancel/denial/empty payload. */
export async function pickImage(
  source: ImageSource,
  launcher?: ImageLauncher,
): Promise<string | null> {
  const mod = launcher ?? (await defaultLauncher());
  if (!(await ensurePhotoAccess(source, mod))) return null;
  const result =
    source === "camera"
      ? await mod.launchCameraAsync({ ...PICKER_OPTS })
      : await mod.launchImageLibraryAsync({ ...PICKER_OPTS });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (asset?.base64 === undefined || asset.base64 === "") return null;
  return toDataUri(asset.base64, asset.mimeType);
}
