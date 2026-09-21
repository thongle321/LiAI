/** Phase 1 feedback loop: one tap must not re-start() while throttled,
 * even from the OTHER screen (chat stays mounted under /voice). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clearVoiceThrottle,
  isVoiceThrottled,
  setVoiceThrottled,
} from "../lib/voiceStatus.ts";

describe("shared voice throttle", () => {
  it("stays throttled across call sites until the lockout lapses", () => {
    clearVoiceThrottle();
    assert.equal(isVoiceThrottled(), false);
    setVoiceThrottled();
    // Same module state seen from dictation AND the voice tab.
    assert.equal(isVoiceThrottled(), true);
    clearVoiceThrottle();
    assert.equal(isVoiceThrottled(), false);
  });
});
