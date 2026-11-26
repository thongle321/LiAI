/** Thumbnail import/export rules (PocketPal's imageUtils). */

import {
  isLocalThumbnailPath,
  isRemoteThumbnailUrl,
  keepRemoteThumbnailUrl,
  saveBase64Image,
  readThumbnailAsBase64,
  thumbnailExportPayload,
} from "../thumbnail.ts";

/** expo-file-system/legacy for this suite, following the downloads-suite
 *  per-suite mock precedent (moduleNameMapper cannot intercept the
 *  expo-file-system/legacy subpath under the RN jest resolver). */
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => "AAAA"),
}));

describe("thumbnail helpers", () => {
  describe("isLocalThumbnailPath", () => {
    it("detects file:// URIs", () => {
      expect(isLocalThumbnailPath("file:///path/to/thumb.png")).toBe(true);
    });
    it("detects relative paths", () => {
      expect(isLocalThumbnailPath("thumb.png")).toBe(true);
    });
    it("rejects http(s) URLs", () => {
      expect(isLocalThumbnailPath("https://example.com/thumb.png")).toBe(false);
      expect(isLocalThumbnailPath("http://example.com/thumb.png")).toBe(false);
    });
  });

  describe("isRemoteThumbnailUrl", () => {
    it("detects http(s) URLs", () => {
      expect(isRemoteThumbnailUrl("https://example.com/thumb.png")).toBe(true);
      expect(isRemoteThumbnailUrl("http://example.com/thumb.png")).toBe(true);
    });
    it("rejects file:// URIs", () => {
      expect(isRemoteThumbnailUrl("file:///path/to/thumb.png")).toBe(false);
    });
  });

  describe("keepRemoteThumbnailUrl", () => {
    it("keeps only remote URLs (PocketPal import parity)", () => {
      expect(keepRemoteThumbnailUrl("https://example.com/thumb.png")).toEqual(
        "https://example.com/thumb.png",
      );
      expect(keepRemoteThumbnailUrl("http://example.com/t.png")).toEqual(
        "http://example.com/t.png",
      );
      expect(keepRemoteThumbnailUrl("file:///etc/passwd")).toBeUndefined();
      expect(keepRemoteThumbnailUrl("file:///data/x/companion-thumbnails/x_thumbnail.png")).toBeUndefined();
      expect(keepRemoteThumbnailUrl(null)).toBeUndefined();
      expect(keepRemoteThumbnailUrl(42)).toBeUndefined();
    });
  });

  describe("saveBase64Image filename validation (PocketPal parity)", () => {
    it("rejects traversal in companion id or extension before touching the FS", async () => {
      await expect(
        saveBase64Image("data:image/png;base64,AAAA", "../../evil"),
      ).resolves.toBeNull();
      await expect(
        saveBase64Image("data:image/../../evil;base64,AAAA", "good-id"),
      ).resolves.toBeNull();
      await expect(
        saveBase64Image("data:image/pn g;base64,AAAA", "good-id"),
      ).resolves.toBe("file:///documents/companion-thumbnails/good-id_thumbnail.pn g");
    });
  });

  describe("readThumbnailAsBase64 ownership guard", () => {
    it("rejects URIs outside our thumbnail directory", async () => {
      await expect(readThumbnailAsBase64("file:///etc/passwd")).resolves.toBeNull();
      await expect(
        readThumbnailAsBase64("file:///documents/companion-thumbnails/../models/x.jpg"),
      ).resolves.toBeNull();
      // %2f stays a literal filename segment (the FS does not decode it),
      // so the read proceeds — the mock returns "AAAA".
      await expect(
        readThumbnailAsBase64("file:///documents/companion-thumbnails/..%2fsecret.jpg"),
      ).resolves.toBe("data:image/jpg;base64,AAAA");
    });
  });

  describe("thumbnailExportPayload", () => {
    it("returns empty for no thumbnail", () => {
      expect(thumbnailExportPayload(undefined)).toEqual({});
    });
    it("returns remote URL for http(s)", () => {
      expect(thumbnailExportPayload("https://example.com/thumb.png")).toEqual({
        thumbnail_url: "https://example.com/thumb.png",
      });
    });
    it("flags local for deferred base64 read", () => {
      expect(thumbnailExportPayload("file:///path/thumb.png")).toEqual({
        thumbnail_url: undefined,
        thumbnail_data: "DEFERRED",
      });
    });
  });
});