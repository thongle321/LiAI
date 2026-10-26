/** Source-text guards for the chat keyboard geometry (keyboard parity port).
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

describe("the chat screen's geometry carries no keyboard term", () => {
  it("chat.tsx never subscribes to the visibility flag", () => {
    expect(CHAT).not.toMatch(/keyboardVisible/);
    expect(CHAT).not.toMatch(/isVisible/);
  });

  it("the empty band overlay is anchored at the composer's resting height, with nothing else in the anchor", () => {
    // The band's `bottom` is composerHeight alone: no compensation, no bar
    // slot, no keyboard value. This is the line the "empty view moves with
    // the keyboard" bug lives on.
    expect(CHAT).toMatch(
      /<Animated\.View\s*\n\s*className="absolute inset-x-0 top-0"\s*\n\s*style=\{\{ bottom: composerHeight \}\}/,
    );
    // ...and it renders beside the list, not inside it.
    expect(CHAT).toMatch(/<ChatEmptyPlaceholder/);
    expect(CHAT).not.toMatch(/listEmpty=/);
  });

  it("lifts and anchors agree across the composer and its welded overlays", () => {
    // One hook call per screen, same anchor for the composer and every
    // overlay that rides with it.
    expect(CHAT.match(/useKeyboardLift\(keyboardOffset\)/g)).toHaveLength(1);
    expect(CHAT).toMatch(/liftAnchor=\{keyboardOffset\}/);
    expect(COMPOSER).toMatch(/useKeyboardLift\(liftAnchor\)/);
    expect(VISION_OVERLAYS).toMatch(/useKeyboardLift\(liftAnchor\)/);
  });
});

describe("the message list never renders the empty state", () => {
  it("no ListEmptyComponent wiring, no empty-state centring classes, no listEmpty prop", () => {
    expect(LIST).not.toMatch(/ListEmptyComponent=\{/);
    expect(LIST).not.toMatch(/listEmpty[,:]/);
    expect(LIST).not.toMatch(/flex-grow/);
    expect(LIST).not.toMatch(/justify-center/);
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
