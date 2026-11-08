/** Thumbnail import/export rules (PocketPal's imageUtils). */

import {
  isLocalThumbnailPath,
  isRemoteThumbnailUrl,
  saveBase64Image,
  readThumbnailAsBase64,
  thumbnailExportPayload,
} from "../thumbnail.ts";

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