/** Attachment seam: data-uri building + expo-image-picker wiring (fake launcher). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ensurePhotoAccess,
  MAX_IMAGES,
  pickImages,
  toDataUri,
} from "../lib/chat/attachments.ts";

function launcher(over: Record<string, unknown> = {}) {
  return {
    requestCameraPermissionsAsync: async () => ({ status: "granted" }),
    requestMediaLibraryPermissionsAsync: async () => ({ status: "granted" }),
    launchCameraAsync: async () => ({ canceled: true, assets: [] }),
    launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
    ...over,
  };
}

describe("toDataUri", () => {
  it("builds a data-uri the local turn accepts", () => {
    assert.equal(toDataUri("aGVsbG8=", "image/jpeg"), "data:image/jpeg;base64,aGVsbG8=");
  });

  it("defaults a missing mime to jpeg", () => {
    assert.equal(toDataUri("eA==", undefined), "data:image/jpeg;base64,eA==");
  });
});

describe("ensurePhotoAccess", () => {
  it("grants camera when the OS says granted", async () => {
    assert.equal(await ensurePhotoAccess("camera", launcher()), true);
  });

  it("denies gallery on a denied status", async () => {
    const mod = launcher({
      requestMediaLibraryPermissionsAsync: async () => ({ status: "denied" }),
    });
    assert.equal(await ensurePhotoAccess("gallery", mod), false);
  });
});

describe("pickImages", () => {
  it("returns one data-uri for a gallery pick", async () => {
    const mod = launcher({
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ base64: "eA==", mimeType: "image/png" }],
      }),
    });
    assert.deepEqual(await pickImages("gallery", mod), [
      "data:image/png;base64,eA==",
    ]);
  });

  it("returns every selected photo, in order", async () => {
    // G8: the whole point -- more than one photo per turn.
    const mod = launcher({
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [
          { base64: "YQ==", mimeType: "image/png" },
          { base64: "Yg==", mimeType: "image/jpeg" },
        ],
      }),
    });
    assert.deepEqual(await pickImages("gallery", mod), [
      "data:image/png;base64,YQ==",
      "data:image/jpeg;base64,Yg==",
    ]);
  });

  it("caps the list at MAX_IMAGES even if the OS returns more", async () => {
    // selectionLimit is advisory; the bound has to hold at OUR seam or a
    // runaway attach becomes a multi-megabyte body the model never wanted.
    const mod = launcher({
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: Array.from({ length: 12 }, (_, i) => ({
          base64: `a${i}`,
          mimeType: "image/png",
        })),
      }),
    });
    assert.equal((await pickImages("gallery", mod)).length, MAX_IMAGES);
  });

  it("asks the gallery for no more than MAX_IMAGES", async () => {
    let asked: Record<string, unknown> = {};
    const mod = launcher({
      launchImageLibraryAsync: async (o: Record<string, unknown>) => {
        asked = o;
        return { canceled: true, assets: [] };
      },
    });
    await pickImages("gallery", mod);
    assert.equal(asked.selectionLimit, MAX_IMAGES);
  });

  it("skips an asset with no base64 payload rather than yielding an empty slot", async () => {
    const mod = launcher({
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ mimeType: "image/jpeg" }, { base64: "Yg==", mimeType: "image/png" }],
      }),
    });
    assert.deepEqual(await pickImages("gallery", mod), [
      "data:image/png;base64,Yg==",
    ]);
  });

  it("returns one data-uri for a camera shot", async () => {
    const mod = launcher({
      launchCameraAsync: async () => ({
        canceled: false,
        assets: [{ base64: "eA==", mimeType: undefined }],
      }),
    });
    assert.deepEqual(await pickImages("camera", mod), [
      "data:image/jpeg;base64,eA==",
    ]);
  });

  it("returns empty on cancel", async () => {
    assert.deepEqual(await pickImages("gallery", launcher()), []);
  });

  it("returns empty without launching when access is denied", async () => {
    let launched = false;
    const mod = launcher({
      requestCameraPermissionsAsync: async () => ({ status: "denied" }),
      launchCameraAsync: async () => {
        launched = true;
        return { canceled: true, assets: [] };
      },
    });
    assert.deepEqual(await pickImages("camera", mod), []);
    assert.equal(launched, false);
  });

  it("returns empty when every asset is unusable", async () => {
    const mod = launcher({
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ mimeType: "image/jpeg" }],
      }),
    });
    assert.deepEqual(await pickImages("gallery", mod), []);
  });
});
