/** Attachments travel as file URIs; only a remote turn encodes them (D5-4).
 *
 * The regression this pins is a memory one that no assertion could see
 * directly: every picked photo used to be base64'd into a JS string
 * (roughly 1.4x its size), persisted that way, and decoded back to a file
 * on each multimodal turn. What is testable is the shape contract that
 * keeps the encoded copy out of the common path - a file resolves to
 * itself and is BORROWED (nobody may delete a photo the message history
 * still renders), and only a legacy data-uri becomes a file we own.
 */

import {
  createImageStore,
  readStoredImage,
  resolveImage,
} from "../images.ts";

type LegacyFs = typeof import("expo-file-system/legacy");

/** The three FS calls this module makes, recorded. */
function fakeFs(
  over: { payload?: string; failRead?: boolean; failWrite?: boolean } = {},
) {
  const writes: Array<[string, string]> = [];
  const reads: string[] = [];
  const fs = {
    documentDirectory: "file:///documents/",
    EncodingType: { Base64: "base64" },
    makeDirectoryAsync: async () => undefined,
    writeAsStringAsync: async (path: string, body: string) => {
      if (over.failWrite === true) throw new Error("disk full");
      writes.push([path, body]);
    },
    readAsStringAsync: async (path: string) => {
      if (over.failRead === true) throw new Error("cache file already reclaimed");
      reads.push(path);
      return over.payload ?? "ZZZ";
    },
  };
  return { fs, writes, reads };
}

function loaderFor(fs: unknown) {
  return async () => fs as LegacyFs;
}

describe("readStoredImage", () => {
  it("reads a picker URI and a bare path as files", () => {
    expect(readStoredImage("file:///cache/a.jpg")).toEqual({
      kind: "file",
      path: "file:///cache/a.jpg",
    });
    expect(readStoredImage("/cache/a.jpg")).toEqual({
      kind: "file",
      path: "/cache/a.jpg",
    });
  });

  it("reads a legacy base64 payload as data, keeping it whole", () => {
    expect(readStoredImage("data:image/jpeg;base64,AAA")).toEqual({
      kind: "data",
      dataUri: "data:image/jpeg;base64,AAA",
    });
  });

  it("refuses what it cannot use rather than passing it to an engine", () => {
    expect(readStoredImage("")).toBe(null);
    expect(readStoredImage("   ")).toBe(null);
    // Not an image payload: a data URI of some other type is a caller bug.
    expect(readStoredImage("data:text/plain;base64,AAA")).toBe(null);
    expect(readStoredImage("data:image/jpeg;base64,")).toBe(null);
  });
});

describe("resolveImage (D5-4)", () => {
  it("hands a file straight to the engine, borrowing it", async () => {
    // A loader that THROWS proves the file branch never opens expo-file-
    // system: there is nothing to decode, so there is nothing to read.
    const store = createImageStore(async () => {
      throw new Error("a file attachment must not touch the file system");
    });
    await expect(
      store.resolveImage("file:///cache/a.jpg"),
    ).resolves.toEqual({ path: "file:///cache/a.jpg", owned: false });
  });

  it("decodes a legacy data-uri into a file this turn OWNS", async () => {
    const { fs, writes } = fakeFs();
    const store = createImageStore(loaderFor(fs));
    const resolved = await store.resolveImage("data:image/jpeg;base64,AAA");
    expect(resolved?.owned).toBe(true);
    expect(resolved?.path).toContain("file:///documents/chat-images/");
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toBe("AAA");
  });

  it("reports an undecodable legacy row as unusable, so the turn is text-only", async () => {
    const { fs } = fakeFs({ failWrite: true });
    const store = createImageStore(loaderFor(fs));
    await expect(store.resolveImage("data:image/jpeg;base64,AAA")).resolves.toBe(
      null,
    );
  });

  it("works on the live store: the module imports with no file system loaded", async () => {
    // The exported pair is what the turn and the store use, so this is the
    // one that proves the lazy loader really is lazy.
    await expect(resolveImage("file:///cache/a.jpg")).resolves.toEqual({
      path: "file:///cache/a.jpg",
      owned: false,
    });
  });
});

describe("toDataUris (remote turns only)", () => {
  it("encodes a file and labels it from the bytes, not an assumption", async () => {
    const { fs, reads } = fakeFs({ payload: "iVBORw0KGgoAAA" });
    const store = createImageStore(loaderFor(fs));
    await expect(store.toDataUris(["file:///cache/a.png"])).resolves.toEqual([
      "data:image/png;base64,iVBORw0KGgoAAA",
    ]);
    expect(reads).toEqual(["file:///cache/a.png"]);
  });

  it("passes a data-uri through without reading anything", async () => {
    const { fs, reads } = fakeFs();
    const store = createImageStore(loaderFor(fs));
    await expect(
      store.toDataUris(["data:image/jpeg;base64,AAA"]),
    ).resolves.toEqual(["data:image/jpeg;base64,AAA"]);
    expect(reads).toEqual([]);
  });

  it("drops an unreadable photo rather than failing the turn", async () => {
    const { fs } = fakeFs({ failRead: true });
    const store = createImageStore(loaderFor(fs));
    await expect(
      store.toDataUris(["file:///cache/gone.jpg", "data:image/jpeg;base64,AAA"]),
    ).resolves.toEqual(["data:image/jpeg;base64,AAA"]);
  });
});