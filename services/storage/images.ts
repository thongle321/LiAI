/** Attached images are the file URIs the platform already handed us.
 *
 * D5-4. A picked photo used to be base64'd into a JS string (roughly 1.4x
 * its size), persisted in that form, and decoded back to a file on every
 * multimodal turn - memory and CPU spent on exactly the low-end devices
 * this app targets. Neither engine needs the string: llama.rn takes
 * `media_paths` of `file://` URIs directly (llama.rn README:367) and
 * `<Image source={{ uri }} />` renders a URI whatever its scheme. The
 * picker's cache file is the truth end to end, which is also how the
 * reference app does it: pocketpal-ai never asks expo-image-picker for
 * base64 (ChatInput.tsx:280-328), stores `asset.uri` as-is
 * (ChatSessionRepository.ts:463-465) and copies or deletes no picked
 * image anywhere in src/.
 *
 * One encoding survives: a REMOTE provider reads an OpenAI content
 * array, which cannot see our files, so `toDataUris` encodes at that
 * boundary and nowhere else.
 *
 * Data URIs are still accepted on the way in. Rows persisted before this
 * change hold them, so a message sent before an upgrade keeps its photo
 * instead of rendering a broken thumbnail.
 */

/** A file the turn did not create, so the turn must not delete it. */
export interface ResolvedImage {
  /** llama `media_paths` shape: a `file://` URI or a bare path. */
  path: string;
  /** true only for a file this module wrote. */
  owned: boolean;
}

/** What a stored attachment actually is. */
export type StoredImage =
  | { kind: "file"; path: string }
  | { kind: "data"; dataUri: string };

/** Base64 image payloads. `+` not `*`: an empty payload is an unusable
 *  attachment, and decoding one wrote a zero-byte JPEG the engine then
 *  choked on. */
const DATA_URI = /^data:image\/\w+;base64,(.+)$/;

/** Classify a stored attachment; null = not an image we can use.
 *
 *  Pure, and deliberately the only place the two shapes are told apart:
 *  everything downstream branches on `kind` instead of sniffing a
 *  prefix, so there is one place to change if a third shape appears. */
export function readStoredImage(value: string): StoredImage | null {
  if (value.startsWith("data:")) {
    return DATA_URI.test(value) ? { kind: "data", dataUri: value } : null;
  }
  return value.trim() === "" ? null : { kind: "file", path: value };
}

/** JPEG or PNG, from the first bytes of a base64 JPEG/PNG payload.
 *
 *  The picker may hand back either (Android re-encodes to JPEG at
 *  `quality`, iOS keeps the original), and a remote server that is told
 *  `image/jpeg` about PNG bytes rejects the request - so the prefix is
 *  sniffed from the data rather than assumed. `iVBORw0KGgo` is the
 *  base64 of the PNG magic number. */
function sniffMime(base64: string): string {
  return base64.startsWith("iVBORw0KGgo") ? "image/png" : "image/jpeg";
}

type LegacyFs = typeof import("expo-file-system/legacy");

/** The FS-touching half, built over a loader so node tests inject a fake
 *  instead of loading expo-file-system - the same seam as
 *  `createSecrets` in store/models/storage.ts, which exists for the same
 *  reason. */
export function createImageStore(load: () => Promise<LegacyFs>) {
  /** data-uri → a fresh OWNED file under documentDirectory.
   *  Only legacy rows reach this; null when it cannot be written. */
  async function saveDataUri(dataUri: string): Promise<string | null> {
    const match = DATA_URI.exec(dataUri);
    if (match === null) return null;
    try {
      const FS = await load();
      const dir = `${FS.documentDirectory ?? ""}chat-images/`;
      await FS.makeDirectoryAsync(dir, { intermediates: true });
      const path = `${dir}${Date.now()}.jpg`;
      type WriteOptions = Parameters<typeof FS.writeAsStringAsync>[2];
      // SAFETY: "base64" is the legacy EncodingType.Base64 literal; the
      // options bag is structural so the literal needs only this bridge.
      await FS.writeAsStringAsync(path, match[1], {
        encoding: "base64",
      } as WriteOptions);
      return path;
    } catch {
      return null;
    }
  }

  /** file → data-uri; null when the file is gone or unreadable. */
  async function readDataUri(path: string): Promise<string | null> {
    try {
      const FS = await load();
      const base64 = await FS.readAsStringAsync(path, {
        encoding: FS.EncodingType.Base64,
      });
      return `data:${sniffMime(base64)};base64,${base64}`;
    } catch {
      return null;
    }
  }

  /** Every attachment as a data URI, encoding only the ones that need
   *  it: a legacy data-uri passes straight through, and an unreadable
   *  file is dropped rather than failing the turn. */
  async function toDataUris(images: readonly string[]): Promise<string[]> {
    const out: string[] = [];
    for (const image of images) {
      const stored = readStoredImage(image);
      if (stored === null) continue;
      if (stored.kind === "data") {
        out.push(stored.dataUri);
        continue;
      }
      const encoded = await readDataUri(stored.path);
      if (encoded !== null) out.push(encoded);
    }
    return out;
  }

  /** Stored attachment → a file the engine can read.
   *
   *  A path passes through BORROWED: it is the message's own attachment
   *  (the picker's cache file, or a camera frame the OS reclaims), so
   *  deleting it would break the thumbnail the history still renders. A
   *  legacy data-uri is decoded into a fresh OWNED file, because nothing
   *  else on disk holds those bytes. */
  async function resolveImage(value: string): Promise<ResolvedImage | null> {
    const stored = readStoredImage(value);
    if (stored === null) return null;
    if (stored.kind === "file") return { path: stored.path, owned: false };
    const path = await saveDataUri(stored.dataUri);
    return path === null ? null : { path, owned: true };
  }

  return { saveDataUri, readDataUri, toDataUris, resolveImage };
}

/** The live store: expo-file-system loads on first use, never at import
 *  time, so a node test can import this module and call the pure half. */
const store = createImageStore(() => import("expo-file-system/legacy"));

export const { toDataUris, resolveImage } = store;