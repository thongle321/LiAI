/** Contract tests for frontend/lib/voiceStatus.ts. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bargeActionFor,
  showsReplyOverlay,
  voiceErrorAction,
  VOICE_STATUS_LABEL,
} from "../lib/voiceStatus.ts";

describe("VOICE_STATUS_LABEL", () => {
  it("labels every phase for the status line", () => {
    assert.equal(VOICE_STATUS_LABEL.idle, "Tap to talk");
    assert.equal(VOICE_STATUS_LABEL.listening, "Listening…");
    assert.equal(VOICE_STATUS_LABEL.thinking, "Thinking…");
    assert.equal(VOICE_STATUS_LABEL.speaking, "Speaking…");
  });
});

describe("showsReplyOverlay", () => {
  it("shows the Playing-audio block only while the AI replies", () => {
    assert.equal(showsReplyOverlay("speaking"), true);
    assert.equal(showsReplyOverlay("listening"), false);
    assert.equal(showsReplyOverlay("thinking"), false);
    assert.equal(showsReplyOverlay("idle"), false);
  });
});

describe("voiceErrorAction", () => {
  it("denied permission fails at once", () => {
    const a = voiceErrorAction(0, "not-allowed");
    assert.equal(a.fatal, true);
    assert.match(a.message, /Microphone access/);
  });
  it("early failures nudge and keep listening", () => {
    const a = voiceErrorAction(0, "no-speech");
    assert.equal(a.fatal, false);
  });
  it("a long failure run gives up with clean copy (no raw code)", () => {
    const a = voiceErrorAction(99, "network");
    assert.equal(a.fatal, true);
    assert.match(a.message, /trouble hearing you/i);
    // The raw recognizer code must never reach the UI (Q3).
    assert.doesNotMatch(a.message, /network/);
  });
  it("throttling fails at once — retrying extends the ban", () => {
    const a = voiceErrorAction(0, "too-many-requests");
    assert.equal(a.fatal, true);
    assert.match(a.message, /Too many voice requests/);
  });
  it("busy also throttles — retrying extends the ban", () => {
    const a = voiceErrorAction(0, "busy");
    assert.equal(a.fatal, true);
    assert.match(a.message, /Too many voice requests/);
  });
});

describe("bargeActionFor", () => {
  it("maps each phase to its mic-tap action", () => {
    // Tap-to-talk: taps never start listening on their own — idle
    // begins, live taps stop back to idle, thinking is in-flight.
    assert.equal(bargeActionFor("speaking"), "interrupt");
    assert.equal(bargeActionFor("listening"), "stop");
    assert.equal(bargeActionFor("thinking"), "ignore");
    assert.equal(bargeActionFor("idle"), "begin");
  });
});
