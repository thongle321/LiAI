/**
 * The end-of-conversation tracker runs on the UI thread (D4-16).
 *
 * A `useCallback` scroll handler wakes the JS thread once per frame, which is
 * exactly when it is busiest laying out a streaming reply. Moving the
 * hysteresis into shared values plus a reaction puts the per-frame work on the
 * UI thread and hops to JS only when the flag actually flips.
 *
 * This is a structural assertion because that is the only honest seam here:
 * `useAnimatedReaction` re-fires off shared-value changes, and the Jest mock
 * runs the body once on mount. A behavioural test would either pass against a
 * mock that never re-ran, or need a real UI thread. What is worth pinning is
 * the shape of the mechanism, so a plain `onScroll={useCallback(...)}` cannot
 * creep back in unnoticed.
 */

import { readSource } from "@/jest/source.ts";

const source = readSource("components/chat/message-list.tsx");

describe("message list scroll tracker (D4-16)", () => {
  it("tracks the offset with a UI-thread scroll handler", () => {
    expect(source).toMatch(/const handleScroll = useAnimatedScrollHandler\(/);
    // The regression to guard is a plain JS callback reaching the same event.
    expect(source).not.toMatch(/const handleScroll = useCallback\(/);
  });

  it("keeps the hysteresis off the JS thread", () => {
    // The prepare function reads shared values, not an event object: that is
    // what makes it a worklet body rather than a JS callback.
    expect(source).toMatch(/useAnimatedReaction\([\s\S]*?contentHeight\.value/);
    // scheduleOnRN, not runOnJS: the former is the react-native-worklets
    // spelling that Reanimated 4 deprecates runOnJS in favour of.
    expect(source).toMatch(/scheduleOnRN\(reportAtEnd, next\)/);
    expect(source).not.toMatch(/runOnJS/);
  });

  it("drops the JS-thread metrics ref it replaced", () => {
    expect(source).not.toMatch(/metricsRef/);
    expect(source).toMatch(/STICK_DISTANCE/);
    expect(source).toMatch(/LEAVE_DISTANCE/);
  });
});