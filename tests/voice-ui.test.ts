/** Kokoro voice-group UI rules (ticket 04 / spec Q12, Q15a, Q16).
 *
 * Pure module in lib/ so node --test covers it — the screen itself is not
 * node-testable. These are the two rule sets the ticket calls node-
 * testable: download-state → UI-state mapping and voice-tap selection
 * rules. Run: node --test tests/voice-ui.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { kokoroGroupState, voiceTap } from "../lib/tts/voiceUi.ts";
import { KOKORO_VOICES } from "../lib/tts/engines/kokoro.ts";
import type { Voice } from "../lib/tts/types.ts";
import type { TtsModelStatus } from "../lib/tts/download.ts";

const ready: TtsModelStatus = { state: "ready", percent: 100 };
const notInstalled: TtsModelStatus = { state: "not_installed", percent: 0 };
const downloading: TtsModelStatus = { state: "downloading", percent: 42.4 };
const failed: TtsModelStatus = { state: "error", percent: 0, error: "HTTP 503" };

const heart = KOKORO_VOICES[0];
const bella = KOKORO_VOICES[1];
const deviceDefault: Voice = { id: "device-default", name: "Device default voice", engine: "system" };

describe("kokoroGroupState — download triplet → UI state", () => {
  it("maps not_installed and an unknown (null) status to the install body", () => {
    assert.deepEqual(kokoroGroupState(notInstalled), { kind: "install" });
    assert.deepEqual(kokoroGroupState(null), { kind: "install" });
  });

  it("keeps the percent whole and clamped to the 0..100 range", () => {
    assert.deepEqual(kokoroGroupState(downloading), { kind: "downloading", percent: 42 });
    assert.deepEqual(kokoroGroupState({ state: "downloading", percent: 0 }), {
      kind: "downloading",
      percent: 0,
    });
    assert.deepEqual(kokoroGroupState({ state: "downloading", percent: 140 }), {
      kind: "downloading",
      percent: 100,
    });
  });

  it("maps ready to the voice-list body", () => {
    assert.deepEqual(kokoroGroupState(ready), { kind: "ready" });
  });

  it("carries the failure reason, defaulting to none", () => {
    assert.deepEqual(kokoroGroupState(failed), { kind: "error", message: "HTTP 503" });
    assert.deepEqual(kokoroGroupState({ state: "error", percent: 0 }), {
      kind: "error",
      message: null,
    });
  });
});

describe("voiceTap — row-tap selection rules (Q16)", () => {
  it("offers no outcome while the model is not installed", () => {
    for (const status of [null, notInstalled, downloading, failed]) {
      assert.deepEqual(
        voiceTap({ tapped: heart, currentVoice: null, previewingId: null, status }),
        { kind: "unavailable" },
      );
    }
  });

  it("a fresh tap on a ready group selects the voice and previews it", () => {
    assert.deepEqual(
      voiceTap({ tapped: heart, currentVoice: null, previewingId: null, status: ready }),
      { kind: "select-and-preview" },
    );
  });

  it("tapping the previewing voice stops the preview instead of replaying", () => {
    assert.deepEqual(
      voiceTap({ tapped: heart, currentVoice: heart, previewingId: heart.id, status: ready }),
      { kind: "stop-preview" },
    );
  });

  it("tapping a different voice while one previews switches to it", () => {
    assert.deepEqual(
      voiceTap({ tapped: bella, currentVoice: heart, previewingId: heart.id, status: ready }),
      { kind: "select-and-preview" },
    );
  });

  it("re-tapping the already-selected (silent) voice still previews it", () => {
    assert.deepEqual(
      voiceTap({ tapped: bella, currentVoice: bella, previewingId: null, status: ready }),
      { kind: "select-and-preview" },
    );
  });

  it("ignores taps aimed at a system voice — only kokoro voices get rows", () => {
    assert.deepEqual(
      voiceTap({ tapped: deviceDefault, currentVoice: null, previewingId: null, status: ready }),
      { kind: "unavailable" },
    );
  });
});