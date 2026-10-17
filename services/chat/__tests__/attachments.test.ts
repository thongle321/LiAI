/** The photo-permission gate: camera asks, gallery never does.
 *
 * The regression this pins is a silent one. The gallery used to pre-flight
 * `READ_MEDIA_IMAGES`, which the manifest never declares (it carries only
 * `READ_EXTERNAL_STORAGE maxSdkVersion=32`), so on Android 13+ the request
 * resolved denied with no prompt and `pickImages` returned `[]` — attach
 * doing nothing, with no error anywhere on screen.
 */

import { ensurePhotoAccess, pickImages, type ImageLauncher } from "../attachments.ts";

function launcher(over: Partial<ImageLauncher> = {}): ImageLauncher {
  return {
    getCameraPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
    requestCameraPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    launchCameraAsync: async () => ({ canceled: true }),
    launchImageLibraryAsync: async () => ({ canceled: true }),
    ...over,
  };
}

const asset = { uri: "file:///cache/img.jpg" };

describe("ensurePhotoAccess (D5-2)", () => {
  it("never asks for a media-library permission: the system picker needs none", async () => {
    // A launcher carrying a media-library query that THROWS proves the gate
    // never reaches for it — the method is not even on ImageLauncher now.
    const mod = {
      getCameraPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
      requestCameraPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
      launchCameraAsync: async () => ({ canceled: true }),
      launchImageLibraryAsync: async () => ({ canceled: true }),
      getMediaLibraryPermissionsAsync: async () => {
        throw new Error("gallery must not ask for media-library permission");
      },
    } as unknown as ImageLauncher;
    await expect(ensurePhotoAccess("gallery", mod)).resolves.toBe("granted");
  });

  it("returns granted for the camera when permission is already held", async () => {
    const mod = launcher({
      getCameraPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
      requestCameraPermissionsAsync: async () => {
        throw new Error("must not re-request a held permission");
      },
    });
    await expect(ensurePhotoAccess("camera", mod)).resolves.toBe("granted");
  });

  it("requests the camera when it is not held yet", async () => {
    await expect(ensurePhotoAccess("camera", launcher())).resolves.toBe("granted");
  });

  it("routes a camera denial the user can no longer be prompted for to Settings", async () => {
    const mod = launcher({
      getCameraPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
    });
    await expect(ensurePhotoAccess("camera", mod)).resolves.toBe("settings");
  });

  it("reports unavailable when the camera query itself throws", async () => {
    const mod = launcher({
      getCameraPermissionsAsync: async () => {
        throw new Error("no camera hardware");
      },
    });
    await expect(ensurePhotoAccess("camera", mod)).resolves.toBe("unavailable");
  });
});

describe("pickImages (D5-2)", () => {
  it("attaches a picked gallery photo without any permission round-trip", async () => {
    const mod = launcher({
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [asset] }),
    });
    await expect(pickImages("gallery", mod)).resolves.toEqual([
      "file:///cache/img.jpg",
    ]);
  });

  it("returns an empty list when the user cancels", async () => {
    await expect(pickImages("gallery", launcher())).resolves.toEqual([]);
  });
});