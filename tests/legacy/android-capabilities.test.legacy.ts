/** Android hardware-capability declarations (changelog gap C8).
 *
 * The camera-optional behavior now lives in the COMMITTED manifest
 * (android/app/src/main/AndroidManifest.xml) — PocketPal's mechanism —
 * instead of a prebuild config plugin, because android/ is tracked and
 * prebuild leaves a committed tree alone. `expo prebuild --clean` is the
 * one thing that discards it, which is what the .gitignore assertion below
 * guards.
 *
 * Run: node --test tests/android-capabilities.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("android hardware capabilities", () => {
  it("declares app.json's plugins key exactly once", () => {
    // REGRESSION. Adding a second top-level "plugins" key to app.json is
    // invalid JSON, and which one survives is parser-dependent: Expo's
    // lenient parser accepted a duplicate while PowerShell's did not. A
    // plugin silently vanishing from the native build is very hard to spot,
    // because the JS side still works.
    const matches = read("app.json").match(/^\s{4}"plugins"\s*:/gm) ?? [];
    assert.equal(
      matches.length,
      1,
      `app.json must have exactly one top-level "plugins" key, found ${matches.length}`,
    );
  });

  it("declares the camera hardware optional in the committed manifest", () => {
    // REGRESSION, changelog #893. Declaring android.permission.CAMERA
    // implicitly implies android.hardware.camera with required="true", so
    // without these the Play Store filters LiAI out of camera-less devices.
    // PocketPal carries the identical two lines in its committed manifest.
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    assert.match(
      manifest,
      /<uses-feature android:name="android\.hardware\.camera" android:required="false"\/>/,
      "android.hardware.camera must be declared required=false",
    );
    assert.match(
      manifest,
      /<uses-feature android:name="android\.hardware\.camera\.any" android:required="false"\/>/,
      "android.hardware.camera.any must be declared required=false",
    );
  });

  it("keeps android/ tracked, so prebuild cannot silently drop those lines", () => {
    // The old mechanism was a config plugin (regenerated every prebuild);
    // the new one is the tracked manifest itself. Re-adding /android/ to
    // .gitignore puts the plugin-less tree back to template-regenerated on
    // the next clean prebuild — the exact silent-loss failure #893 was.
    assert.doesNotMatch(
      read(".gitignore"),
      /^\/android\//m,
      "android/ must stay committed — the camera-optional lines live there",
    );
  });

  it("keeps the camera PERMISSION required", () => {
    // The fix relaxes the hardware gate only. Dropping the permission would
    // break the vision tab on devices that do have a camera.
    assert.match(
      read("android/app/src/main/AndroidManifest.xml"),
      /<uses-permission android:name="android\.permission\.CAMERA"\s*\/>/,
      "the CAMERA permission must stay declared",
    );
  });
});

describe("llama.rn native artifacts", () => {
  it("has the prebuilt libs its CMake needs to build the JNI wrappers", () => {
    // REGRESSION, and the nastiest silent failure in the project: llama.rn
    // ships NO binaries in its npm tarball. Its postinstall
    // (install/download-native-artifacts.js) fetches them into
    // android/src/main/jniLibs, and CMake SKIPS every `rnllama_jni_*` target
    // when that directory is empty ("no prebuilt for <abi>"). The build then
    // SUCCEEDS, the app installs and runs, and the only symptom is every
    // chat reply reading "JSI bindings not installed" — a swallowed
    // UnsatisfiedLinkError from RNLlama.loadNative.
    //
    // Fix: npm rebuild llama.rn, then rebuild the app (a Metro reload cannot
    // help; the libraries are native).
    assert.ok(
      existsSync(
        path.join(
          ROOT,
          "node_modules/llama.rn/android/src/main/jniLibs/arm64-v8a/librnllama.so",
        ),
      ),
      "llama.rn native artifacts are missing — run `npm rebuild llama.rn` " +
        "(or node node_modules/llama.rn/install/download-native-artifacts.js), " +
        "clear node_modules/llama.rn/android/.cxx, then rebuild the app",
    );
  });
});
