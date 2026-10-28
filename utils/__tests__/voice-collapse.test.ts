/** The collapse/expand thresholds, numbers verbatim from the reference
 *  (pocketpal-ai VoiceModeView / VoiceBar). */

import {
  liftsExpand,
  pullsCollapse,
  VOICE_EXPAND_SWIPE_PT,
  VOICE_FLICK_VELOCITY,
  VOICE_LIFT_LIMIT_PT,
  VOICE_PULL_COLLAPSE_PT,
} from "../voice-collapse";

describe("voice collapse thresholds", () => {
  it("the numbers are the reference's runtime values", () => {
    expect(VOICE_PULL_COLLAPSE_PT).toBe(80);
    expect(VOICE_FLICK_VELOCITY).toBe(800);
    expect(VOICE_EXPAND_SWIPE_PT).toBe(40);
    expect(VOICE_LIFT_LIMIT_PT).toBe(120);
  });

  it("a long pull or a fast flick collapses", () => {
    expect(pullsCollapse(80, 0)).toBe(false); // exactly at the edge: hold
    expect(pullsCollapse(81, 0)).toBe(true);
    expect(pullsCollapse(30, 1200)).toBe(true);
    expect(pullsCollapse(30, 100)).toBe(false);
  });

  it("a long swipe or a fast flick expands", () => {
    expect(liftsExpand(-40, 0)).toBe(false); // exactly at the edge: hold
    expect(liftsExpand(-41, 0)).toBe(true);
    expect(liftsExpand(-30, -1200)).toBe(true);
    expect(liftsExpand(-300, 500)).toBe(true); // velocity wins over distance
    expect(liftsExpand(-10, 0)).toBe(false);
  });
});
