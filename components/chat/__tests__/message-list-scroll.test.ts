/**
 * The end-of-conversation tracker runs on the UI thread (D4-16).
 *
 * A `useCallback` scroll handler wakes the JS thread once per frame, which is
 * exactly when it is busiest laying out a streaming reply. Moving the
 * hysteresis into shared values puts the per-frame work on the UI thread and
 * hops to JS only when the flag actually flips.
 *
 * The hysteresis math is PocketPal's own (ChatView.tsx:492-525, the port):
 * underflow (content shorter than viewport ⇒ reader is definitionally at the
 * end), clamp to kill rubber-band noise on an inverted list, STICK=24 LEAVE=40.
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

describe("message list scroll tracker (PocketPal port, D4-16)", () => {
  it("tracks the offset with a UI-thread scroll handler", () => {
    expect(source).toMatch(/const handleScroll = useAnimatedScrollHandler\(/);
    // The regression to guard is a plain JS callback reaching the same event.
    expect(source).not.toMatch(/const handleScroll = useCallback\(/);
  });

  it("keeps the PocketPal hysteresis on the UI thread in shared values", () => {
    // The handler reads only the event object inside the worklet and writes
    // shared values — no JS call per frame.
    expect(source).toMatch(/underflow\.value = contentHeight <= viewportHeight \+ EPS/);
    expect(source).toMatch(/clampedY > LEAVE_DISTANCE/);
    expect(source).toMatch(/clampedY < STICK_DISTANCE/);
  });

  it("hops to JS only on a flip, via scheduleOnRN", () => {
    expect(source).toMatch(/useAnimatedReaction\(/);
    expect(source).toMatch(/scheduleOnRN\(reportAtEnd, next === 1\)/);
    // scheduleOnRN, not runOnJS: the former is the react-native-worklets
    // spelling that Reanimated 4 deprecates runOnJS in favour of.
    expect(source).not.toMatch(/runOnJS/);
  });

  it("keeps the STICK/LEAVE constants as exported seams", () => {
    expect(source).toMatch(/export const STICK_DISTANCE = 24;/);
    expect(source).toMatch(/export const LEAVE_DISTANCE = 40;/);
  });
});