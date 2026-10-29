/** Source-text guards for the chat keyboard geometry.
 *
 * Source scans are a last resort (see jest/source.ts), but these three are
 * the pinned invariants of the port — each one revived a real, reported
 * symptom the moment it was violated, and the violation can be one line
 * long:
 *
 * - a keyboard-gated `return null` in the tab bar (the bar unmount grew the
 *   column and re-centred the empty card, and the step it forced into the
 *   composer's compensation was the reported flash);
 * - the empty state as list content (KeyboardChatScrollView's dynamic
 *   contentInset re-centres a centred child while the keyboard rises — the
 *   reported "empty view moves with the keyboard");
 * - a lift whose anchor is 0 (the composer and the vision panel rest above
 *   the mounted bar, so a 0 anchor overshoots by a full bar slot).
 */

import { readSource } from "./source.ts";

const BAR = readSource("app/(drawer)/(tabs)/_layout.tsx");
const VISION = readSource("components/voice/voice-vision-mode.tsx");
const CHAT = readSource("app/(drawer)/(tabs)/chat.tsx");
const LIST = readSource("components/chat/message-list.tsx");
const PLACEHOLDER = readSource("components/chat/chat-empty-placeholder.tsx");
const COMPOSER = readSource("components/chat/message-input.tsx");
const VISION_OVERLAYS = readSource("components/vision/vision-overlays.tsx");
const LIFT = readSource("hooks/useKeyboardLift.ts");
const STORE = readSource("store/keyboard.ts");

describe("tab bar is never keyboard-gated", () => {
  it("the bar component has no visibility return-out and no store flag subscription", () => {
    expect(BAR).not.toMatch(/keyboardVisible/);
    expect(BAR).not.toMatch(/isVisible/);
    expect(BAR).not.toMatch(/return null/);
  });

  it("vision's panel geometry carries no visibility term either", () => {
    expect(VISION).not.toMatch(/s\.isVisible/);
    expect(VISION).toMatch(/const panelBottom = 12/);
  });
});

describe("the chat route derives ONE reconciled occlusion (2026-10-29 full port)", () => {
  it("the route is the screen's only keyboard reader; the composer consumes the shared value", () => {
    // PocketPal's thesis (ChatView.tsx:461-469): composer translate, list
    // spacer and overlays all derive from ONE value "so they never
    // disagree". Per-VIEW hooks each reading keyboard.height are exactly
    // the two-measurements race the stuck-composer repro showed.
    expect(CHAT.match(/useReanimatedKeyboardAnimation\(\)/g)).toHaveLength(1);
    expect(LIST).not.toMatch(/useReanimatedKeyboardAnimation/);
    expect(COMPOSER).not.toMatch(/useReanimatedKeyboardAnimation/);
    expect(COMPOSER).not.toMatch(/useKeyboardLift/);
  });

  it("the occlusion derives through the pure geometry, anchored at the bar slot", () => {
    expect(CHAT).toMatch(
      /keyboardOcclusion\(keyboard\.height\.value, keyboardOffset\)/,
    );
    expect(CHAT).toMatch(
      /const composerLift = useAnimatedStyle\(\(\) => \(\{\s*transform: \[\{ translateY: -occlusion\.value \}\],?\s*\}\)\);/,
    );
  });

  it("the composer receives the shared occlusion and lifts verbatim", () => {
    expect(COMPOSER).toMatch(/occlusion: SharedValue<number>/);
    expect(COMPOSER).toMatch(/transform: \[\{ translateY: -occlusion\.value \}\]/);
    expect(COMPOSER).not.toMatch(/liftAnchor/);
    expect(CHAT).not.toMatch(/liftAnchor/);
  });

  it("the composer's welded overlays ride the same lift", () => {
    expect(CHAT.match(/style=\{\[composerLift, \{ bottom: composerHeight \}\]\}/g))
      .toHaveLength(2);
    // Vision mode no longer has a text input, so its panel no longer lifts.
    expect(VISION_OVERLAYS).not.toMatch(/useKeyboardLift/);
  });
});

describe("the empty state is list content (PocketPal's flow)", () => {
  it("no empty-state overlay band beside the list any more", () => {
    expect(CHAT).not.toMatch(
      /className="absolute inset-x-0 top-0"\s*\n\s*style=\{\{ bottom: composerHeight \}\}/,
    );
  });

  it("the placeholder owns its own centring and no bottomInset margin", () => {
    expect(PLACEHOLDER).not.toMatch(/bottomInset/);
    expect(PLACEHOLDER).toMatch(/className="flex-1 items-center justify-center px-8"/);
  });
});

describe("the shared lift keeps its anchor contract in prose", () => {
  it("useKeyboardLift's doc still states the anchor rule", () => {
    expect(LIFT).toMatch(/insetsBottom\` MUST be the view's own bottom anchor/);
  });

  it("the store header states the ported shape (bar mounted, lifts only)", () => {
    expect(STORE).toMatch(/bar stays mounted/);
    expect(STORE).not.toMatch(/return null/);
  });
});
