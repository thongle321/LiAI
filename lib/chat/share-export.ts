/** Hand an exported file to the user.
 *
 * Device-only: expo-file-system and expo-sharing are native modules, so
 * this cannot be node-tested — which is exactly why the CONTENT is
 * produced by lib/chat/export.ts (pure, tested) and this file only moves
 * the finished string to somewhere the user can reach.
 *
 * cacheDirectory, not documentDirectory: on Android documentDirectory is
 * app-private (/data/data/<pkg>/files) so a file written there is
 * unreachable, and the OS reclaims the cache on its own.
 */

import type { ExportKind } from "./export.ts";

const MIME: Record<ExportKind, string> = {
  markdown: "text/markdown",
  session: "application/json",
  all: "application/json",
};

export async function shareExportedFile(
  filename: string,
  contents: string,
  kind: ExportKind,
): Promise<void> {
  const FS = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  type WriteOptions = Parameters<typeof FS.writeAsStringAsync>[2];
  const dir = `${FS.cacheDirectory ?? ""}exports`;
  await FS.makeDirectoryAsync(dir, { intermediates: true });
  const path = `${dir}/${filename}`;
  // SAFETY: "utf8" is the legacy EncodingType.UTF8 literal; the options
  // bag is structural so the literal needs only this bridge.
  await FS.writeAsStringAsync(path, contents, { encoding: "utf8" } as WriteOptions);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(path, {
    mimeType: MIME[kind],
    dialogTitle: filename,
    UTI: kind === "markdown" ? "net.daringfireball.markdown" : "public.json",
  });
}

/** The host of a provider's base URL, for the menu's remote-model label. */
export function providerHost(baseUrl: string): string {
  const match = /^[a-z]+:\/\/([^/?#]+)/i.exec(baseUrl.trim());
  return match?.[1] ?? baseUrl;
}
