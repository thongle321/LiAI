/** Contract tests for frontend/lib/voiceStatus.ts. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  showsReplyOverlay,
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
