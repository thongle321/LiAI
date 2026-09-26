/** Link-preview seam: URL extraction (pure) + preview fetch (fake fetcher). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { fetchPreview, firstUrl } from "../lib/chat/link-preview.ts";

describe("firstUrl", () => {
  it("returns null when the text has no URL", () => {
    assert.equal(firstUrl("just some words"), null);
  });

  it("extracts the first URL from assistant prose", () => {
    assert.equal(
      firstUrl("See https://example.com/a and https://example.com/b for details."),
      "https://example.com/a",
    );
  });

  it("strips trailing punctuation from the match", () => {
    assert.equal(firstUrl("Read this (https://example.com/docs)."), "https://example.com/docs");
  });

  it("ignores non-http schemes", () => {
    assert.equal(firstUrl("Open liai://settings today"), null);
  });
});

describe("fetchPreview", () => {
  it("normalizes title, description, image and site", async () => {
    const fake = async () => ({
      url: "https://example.com/a",
      title: "Example",
      siteName: "Example",
      description: "Docs and guides.",
      images: ["https://example.com/og.png"],
    });
    assert.deepEqual(await fetchPreview("https://example.com/a", fake), {
      url: "https://example.com/a",
      title: "Example",
      siteName: "Example",
      description: "Docs and guides.",
      image: "https://example.com/og.png",
    });
  });

  it("degrades a media-only response to a bare URL card", async () => {
    const fake = async () => ({
      url: "https://example.com/photo.jpg",
      mediaType: "image",
      contentType: "image/jpeg",
      favicons: [],
      charset: null,
    });
    assert.deepEqual(await fetchPreview("https://example.com/photo.jpg", fake), {
      url: "https://example.com/photo.jpg",
      title: undefined,
      siteName: undefined,
      description: undefined,
      image: undefined,
    });
  });

  it("returns null when the fetch throws (previews stay silent)", async () => {
    const fake = async () => {
      throw new Error("timeout");
    };
    assert.equal(await fetchPreview("https://example.com/a", fake), null);
  });
});
