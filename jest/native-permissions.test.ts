/** Every native permission the app asks for has a usage string.
 *
 * iOS kills the process when a TCC-gated API is called without a usage
 * description in the plist — not a rejection the app can catch, a launch
 * terminated by the OS. That failure only ever shows up on a real device the
 * first time a user reaches a screen, so it is exactly the kind of thing a
 * config typo must not be able to ship.
 *
 * The check is deliberately config-level, not API-level: it reads app.json and
 * asserts the strings exist, so it runs in plain Node with no native modules.
 * A permission granted through a config PLUGIN counts as covered only when the
 * plugin is listed, because that is what actually injects the plist key at
 * `expo prebuild` time.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

type ExpoConfig = {
  plugins?: (string | [string, Record<string, unknown>])[];
  ios?: { infoPlist?: Record<string, unknown> };
  android?: { permissions?: string[] };
};

const config: ExpoConfig = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")).expo;

/** Plugin name -> the plist keys it injects when listed in `plugins[]`.
 * Only the plugins whose permission strings this app depends on. */
const PLUGIN_KEYS: Record<string, string[]> = {
  "expo-image-picker": ["NSPhotoLibraryUsageDescription"],
  "expo-speech-recognition": ["NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription"],
  "react-native-vision-camera": ["NSCameraUsageDescription"],
  "expo-camera": ["NSCameraUsageDescription", "NSMicrophoneUsageDescription"],
};

/** The usage descriptions the app MUST ship, by the capability that needs
 * them. Each entry is the reason the string exists, so a failure names the
 * screen that would crash rather than a bare key. */
const REQUIRED: { key: string; why: string }[] = [
  { key: "NSCameraUsageDescription", why: "vision capture and QR scanning" },
  { key: "NSMicrophoneUsageDescription", why: "voice questions" },
  { key: "NSSpeechRecognitionUsageDescription", why: "transcribing voice questions" },
  { key: "NSPhotoLibraryUsageDescription", why: "attaching gallery photos to a message" },
];

function listedPlugins(): Set<string> {
  return new Set((config.plugins ?? []).map((entry) => (Array.isArray(entry) ? entry[0] : entry)));
}

describe("native permissions", () => {
  const plugins = listedPlugins();

  it("declares every usage description the app depends on", () => {
    const infoPlist = config.ios?.infoPlist ?? {};
    const missing = REQUIRED.filter(
      ({ key }) =>
        !infoPlist[key] &&
        !Object.entries(PLUGIN_KEYS).some(
          ([name, keys]) => plugins.has(name) && keys.includes(key),
        ),
    );
    expect(missing.map(({ key, why }) => `${key} (${why})`)).toEqual([]);
  });

  it("asks for the Android permissions it lists", () => {
    // Android's model is the dangerous inverse: a permission declared in the
    // manifest but never granted is silent, while one requested at runtime
    // with no manifest entry is an instant denial. The camera and microphone
    // are the two the app gates features behind.
    const permissions = config.android?.permissions ?? [];
    for (const key of ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"]) {
      expect(permissions).toContain(key);
    }
  });

  it("gives expo-image-picker a photo-library string, not just the plugin", () => {
    // The plugin's own default reads "Allow $(PRODUCT_NAME) to access your
    // photos", which is the framework speaking, not the app. LiAI's own copy
    // is what the user reads on the iOS prompt.
    const entry = (config.plugins ?? []).find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker",
    );
    expect(Array.isArray(entry) ? entry[1].photosPermission : undefined).toBeTruthy();
  });
});