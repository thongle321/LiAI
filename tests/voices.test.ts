/** Voice narrowing: which device voices a picker may offer.
 *
 * Pure module in lib/ so it is node-testable — node --test cannot import a
 * screen, which is why the rules live here rather than in VoiceSettings.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deviceLanguage,
  filterVoices,
  primaryLanguage,
  SYSTEM_VOICE,
  voiceOptions,
  type DeviceVoice,
} from "../lib/voices.ts";

function voice(over: Partial<DeviceVoice> & { identifier: string }): DeviceVoice {
  return { name: over.identifier, language: "en-US", quality: "default", ...over };
}

describe("primary language", () => {
  it("takes the subtag before the region", () => {
    assert.equal(primaryLanguage("en-GB"), "en");
    assert.equal(primaryLanguage("en_US"), "en");
    assert.equal(primaryLanguage("EN"), "en");
    assert.equal(primaryLanguage("vi-VN"), "vi");
  });
});

describe("device language", () => {
  it("is a bare subtag, never empty in practice", () => {
    const lang = deviceLanguage();
    assert.match(lang, /^[a-z]{2,3}$/);
  });
});

describe("voice filtering", () => {
  it("keeps every regional variant of the device language", () => {
    // The exact-match version of this dropped en-GB on an en-US phone, which
    // is the whole reason the match is on the subtag.
    const voices = [
      voice({ identifier: "us", language: "en-US" }),
      voice({ identifier: "gb", language: "en-GB" }),
      voice({ identifier: "fr", language: "fr-FR" }),
    ];
    assert.deepEqual(
      filterVoices(voices, "en").map((v) => v.identifier),
      ["gb", "us"],
    );
  });

  it("orders the better voices first", () => {
    const voices = [
      voice({ identifier: "plain", quality: "default" }),
      voice({ identifier: "nice", quality: "premium" }),
      voice({ identifier: "good", quality: "enhanced" }),
    ];
    assert.deepEqual(
      filterVoices(voices, "en").map((v) => v.identifier),
      ["nice", "good", "plain"],
    );
  });

  it("falls back to everything when the device has none for its language", () => {
    // An empty picker would look like a broken row, not a device with one
    // language installed.
    const voices = [voice({ identifier: "fr", language: "fr-FR" })];
    assert.deepEqual(
      filterVoices(voices, "en").map((v) => v.identifier),
      ["fr"],
    );
  });

  it("does not mutate the caller's array", () => {
    const voices = [
      voice({ identifier: "b", quality: "default" }),
      voice({ identifier: "a", quality: "premium" }),
    ];
    filterVoices(voices, "en");
    assert.deepEqual(
      voices.map((v) => v.identifier),
      ["b", "a"],
    );
  });
});

describe("voice options", () => {
  it("puts System default first", () => {
    const options = voiceOptions([voice({ identifier: "a" })], null);
    assert.equal(options[0], SYSTEM_VOICE);
    assert.deepEqual(options, [SYSTEM_VOICE, "a"]);
  });

  it("keeps a stored voice visible even when this device dropped it", () => {
    const options = voiceOptions([voice({ identifier: "a" })], "gone");
    assert.deepEqual(options, [SYSTEM_VOICE, "a", "gone"]);
  });

  it("does not duplicate a voice that is still installed", () => {
    const options = voiceOptions([voice({ identifier: "a" })], "a");
    assert.deepEqual(options, [SYSTEM_VOICE, "a"]);
  });
});
