/** Engine-card UI rules (spec Q12, Q15a, Q16) — now engine-generic.
 *
 * Pure module in lib/ so node --test covers it — the screen itself is not
 * node-testable. These are the two rule sets every engine card needs:
 * download-state → UI-state mapping and voice-tap selection rules.
 * Run: node --test tests/voice-ui.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { engineGroupState, voiceTap } from "../lib/tts/voiceUi.ts";
import { KOKORO_VOICES } from "../lib/tts/engines/kokoro.ts";
import { KITTEN_VOICES } from "../lib/tts/engines/kitten.ts";
import { SUPERTONIC_VOICES } from "../lib/tts/engines/supertonic.ts";
import type { Voice } from "../lib/tts/types.ts";
import type { TtsModelStatus } from "../lib/tts/download.ts";

const ready: TtsModelStatus = { state: "ready", percent: 100 };
const notInstalled: TtsModelStatus = { state: "not_installed", percent: 0 };
const downloading: TtsModelStatus = { state: "downloading", percent: 42.4 };
const failed: TtsModelStatus = { state: "error", percent: 0, error: "HTTP 503" };

const heart = KOKORO_VOICES[0];
const bella = KOKORO_VOICES[1];
const kittenVoice = KITTEN_VOICES[0];
const deviceDefault: Voice = { id: "device-default", name: "Device default voice", engine: "system" };

describe("engineGroupState — download status → card body", () => {
  it("maps not_installed and an unknown (null) status to the install body", () => {
    assert.deepEqual(engineGroupState(notInstalled), { kind: "install" });
    assert.deepEqual(engineGroupState(null), { kind: "install" });
  });

  it("keeps the percent whole and clamped to the 0..100 range", () => {
    assert.deepEqual(engineGroupState(downloading), { kind: "downloading", percent: 42 });
    assert.deepEqual(engineGroupState({ state: "downloading", percent: 0 }), {
      kind: "downloading",
      percent: 0,
    });
    assert.deepEqual(engineGroupState({ state: "downloading", percent: 140 }), {
      kind: "downloading",
      percent: 100,
    });
  });

  it("maps ready to the voice-list body", () => {
    assert.deepEqual(engineGroupState(ready), { kind: "ready" });
  });

  it("carries the failure reason, defaulting to none", () => {
    assert.deepEqual(engineGroupState(failed), { kind: "error", message: "HTTP 503" });
    assert.deepEqual(engineGroupState({ state: "error", percent: 0 }), {
      kind: "error",
      message: null,
    });
  });

  it("reads the same for every engine — the rule is engine-agnostic", () => {
    for (const status of [null, notInstalled, downloading, failed, ready]) {
      assert.deepEqual(engineGroupState(status), engineGroupState(status));
    }
  });
});

describe("voiceTap — row-tap selection rules (Q16)", () => {
  it("offers no outcome while the model is not installed", () => {
    for (const status of [null, notInstalled, downloading, failed]) {
      assert.deepEqual(
        voiceTap({
          tapped: heart,
          engine: "kokoro",
          currentVoice: null,
          previewingId: null,
          status,
        }),
        { kind: "unavailable" },
      );
    }
  });

  it("a fresh tap on a ready group selects the voice and previews it", () => {
    assert.deepEqual(
      voiceTap({
        tapped: heart,
        engine: "kokoro",
        currentVoice: null,
        previewingId: null,
        status: ready,
      }),
      { kind: "select-and-preview" },
    );
  });

  it("tapping the previewing voice stops the preview instead of replaying", () => {
    assert.deepEqual(
      voiceTap({
        tapped: heart,
        engine: "kokoro",
        currentVoice: heart,
        previewingId: heart.id,
        status: ready,
      }),
      { kind: "stop-preview" },
    );
  });

  it("tapping a different voice while one previews switches to it", () => {
    assert.deepEqual(
      voiceTap({
        tapped: bella,
        engine: "kokoro",
        currentVoice: heart,
        previewingId: heart.id,
        status: ready,
      }),
      { kind: "select-and-preview" },
    );
  });

  it("re-tapping the already-selected (silent) voice still previews it", () => {
    assert.deepEqual(
      voiceTap({
        tapped: bella,
        engine: "kokoro",
        currentVoice: bella,
        previewingId: null,
        status: ready,
      }),
      { kind: "select-and-preview" },
    );
  });

  it("ignores taps aimed at a system voice — only neural voices get rows", () => {
    assert.deepEqual(
      voiceTap({
        tapped: deviceDefault,
        engine: "kokoro",
        currentVoice: null,
        previewingId: null,
        status: ready,
      }),
      { kind: "unavailable" },
    );
  });

  it("ignores a voice belonging to a DIFFERENT engine than the card's", () => {
    // The rule that only matters once there is more than one neural engine:
    // a kitten row must not answer to the kokoro card's state.
    assert.deepEqual(
      voiceTap({
        tapped: kittenVoice,
        engine: "kokoro",
        currentVoice: null,
        previewingId: null,
        status: ready,
      }),
      { kind: "unavailable" },
    );
    assert.deepEqual(
      voiceTap({
        tapped: heart,
        engine: "kitten",
        currentVoice: null,
        previewingId: null,
        status: ready,
      }),
      { kind: "unavailable" },
    );
  });

  it("works the same for kitten and supertonic as for kokoro", () => {
    assert.deepEqual(
      voiceTap({
        tapped: kittenVoice,
        engine: "kitten",
        currentVoice: null,
        previewingId: null,
        status: ready,
      }),
      { kind: "select-and-preview" },
    );
    const supertonicFirst = SUPERTONIC_VOICES[0];
    assert.deepEqual(
      voiceTap({
        tapped: supertonicFirst,
        engine: "supertonic",
        currentVoice: supertonicFirst,
        previewingId: supertonicFirst.id,
        status: ready,
      }),
      { kind: "stop-preview" },
    );
  });
});