/** Attachment seam: data-uri building + expo-image-picker wiring (fake launcher). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ensurePhotoAccess,
  pickImage,
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
  it("builds a data-uri the backend image path accepts", () => {
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

describe("pickImage", () => {
  it("returns a data-uri for a gallery pick", async () => {
    const mod = launcher({
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ base64: "eA==", mimeType: "image/png" }],
      }),
    });
    assert.equal(await pickImage("gallery", mod), "data:image/png;base64,eA==");
  });

  it("returns a data-uri for a camera shot", async () => {
    const mod = launcher({
      launchCameraAsync: async () => ({
        canceled: false,
        assets: [{ base64: "eA==", mimeType: undefined }],
      }),
    });
    assert.equal(await pickImage("camera", mod), "data:image/jpeg;base64,eA==");
  });

  it("returns null on cancel", async () => {
    assert.equal(await pickImage("gallery", launcher()), null);
  });

  it("returns null without launching when access is denied", async () => {
    let launched = false;
    const mod = launcher({
      requestCameraPermissionsAsync: async () => ({ status: "denied" }),
      launchCameraAsync: async () => {
        launched = true;
        return { canceled: true, assets: [] };
      },
    });
    assert.equal(await pickImage("camera", mod), null);
    assert.equal(launched, false);
  });

  it("returns null when the asset has no base64 payload", async () => {
    const mod = launcher({
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ mimeType: "image/jpeg" }],
      }),
    });
    assert.equal(await pickImage("gallery", mod), null);
  });
});
