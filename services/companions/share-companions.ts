/** Companion export/import device glue: share sheet + document picker.
 *
 *  Device-only (expo-file-system, expo-sharing, expo-document-picker are
 *  native) — the CONTENT is produced and validated by the pure
 *  services/companions//companion-json.ts; this file only moves bytes the user can
 *  reach, exactly like services/chat//share-export.ts.
 */

import { toCompanionsJson, companionExportFilename } from "./companion-json.ts";
import type { Companion } from "@/types/companion.ts";

export async function shareCompanions(companions: Companion[]): Promise<void> {
  const FS = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  type WriteOptions = Parameters<typeof FS.writeAsStringAsync>[2];
  const filename = companionExportFilename(companions.length === 1 ? companions[0] : undefined);
  const dir = `${FS.cacheDirectory ?? ""}exports`;
  await FS.makeDirectoryAsync(dir, { intermediates: true });
  const path = `${dir}/${filename}`;
  // SAFETY: "utf8" is the legacy EncodingType.UTF8 literal; the options
  // bag is structural so the literal needs only this bridge.
  await FS.writeAsStringAsync(path, toCompanionsJson(companions), {
    encoding: "utf8",
  } as WriteOptions);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(path, {
    mimeType: "application/json",
    dialogTitle: filename,
    UTI: "public.json",
  });
}

/** Open the document picker and read the chosen file. Null when the
 *  user cancelled. Throws on a read failure (the caller shows it). */
export async function pickCompanionsFile(): Promise<string | null> {
  const DocumentPicker = await import("expo-document-picker");
  const FS = await import("expo-file-system/legacy");
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return await FS.readAsStringAsync(result.assets[0].uri);
}
