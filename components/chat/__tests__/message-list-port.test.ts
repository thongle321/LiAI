/** Source guards for the PocketPal ChatView port (2026-10-29 full port).
 *
 *  This is the same honest seam as message-list-scroll.test.ts: the list is
 *  Reanimated-driven, the Jest mocks run each body once, and behaviour
 *  against them would pass as easily against a regression. What is worth
 *  pinning is the shape of the mechanism — the exact lines the reported
 *  "composer jumps up when the reply touches it" bug lives on.
 *
 *  The port replaces KeyboardChatScrollView's dynamic contentInset with
 *  PocketPal's own recipe (pocketpal-ai/src/components/ChatView/ChatView.tsx):
 *  a plain inverted FlatList, a ListHeaderComponent spacer fed by ONE
 *  reconciled occlusion value, MVCP pinned streaming, and a scroll engine
 *  that only fires for new user messages. Each guard below is a line the
 *  old verdict docs wrote down once and the port now reverses — see
 *  docs/research/2026-10-29-chat-composer-full-port.md.
 */

import { readSource } from "@/jest/source.ts";

const LIST = readSource("components/chat/message-list.tsx");
const CHAT = readSource("app/(drawer)/(tabs)/chat.tsx");

describe("the list is a plain inverted FlatList (KeyboardChatScrollView out)", () => {
  it("no KeyboardChatScrollView anywhere in the chat's app code", () => {
    expect(LIST).not.toMatch(/KeyboardChatScrollView/);
    expect(CHAT).not.toMatch(/KeyboardChatScrollView/);
  });

  it("inverts only when there is content, rendered newest-first", () => {
    expect(LIST).toMatch(/inverted=\{data\.length > 0\}/);
    // PocketPal's inverted list reads index 0 as the NEWEST turn; our
    // row adapter is oldest-first, so the port is the reversal.
    expect(LIST).toMatch(/row\.kind === "message"\)\.reverse\(\)/);
  });

  it("lets the library do the content inset (contentContainer flexGrow, iOS-safe insets)", () => {
    expect(LIST).toMatch(/automaticallyAdjustContentInsets=\{false\}/);
  });

  it("dismisses the keyboard per platform (PocketPal ChatView.tsx:1082)", () => {
    expect(LIST).toMatch(
      /keyboardDismissMode=\{Platform\.OS === "ios" \? "interactive" : "none"\}/,
    );
  });
});

describe("the list's keyboard spacer (PocketPal ListHeaderComponent)", () => {
  it("holds the newest turn above a rising keyboard via the shared occlusion", () => {
    // The spacer is the direct analog of PocketPal's headerStyle:
    // height = the ONE reconciled occlusion value, wired from the route.
    expect(LIST).toMatch(/ListHeaderComponent=\{renderListHeaderComponent\}/);
    expect(LIST).toMatch(/height: occlusion\.value/);
  });

  it("the pending indicator moved out of the data into the list header", () => {
    // rows.ts still appends the pending row (the adapter's shape is
    // unchanged); the LIST now strips it from data and renders it as the
    // inverted list's ListHeaderComponent — a data row there would grow
    // index 0 mid-stream instead of the growing turn (PocketPal keeps the
    // indicator out of data for the same reason).
    expect(LIST).toMatch(/row\.kind === "message"\)/);
    expect(LIST).not.toMatch(/kind === "pending" \?/);
    expect(LIST).toMatch(/renderPending\(widths\)/);
  });

  it("reserves the composer's MEASURED height with the list's marginBottom", () => {
    // PocketPal hardcodes +100 (ChatEmptyPlaceholder); LiAI measures.
    expect(LIST).toMatch(/marginBottom: composerHeight/);
    expect(CHAT).toMatch(/composerHeight=\{composerHeight\}/);
    expect(CHAT).not.toMatch(/extraContentPadding/);
    expect(CHAT).not.toMatch(/blankSpace/);
  });
  it("has no item layout animation (unsupported inside an inverted list)", () => {
    // Reanimated layout animations do not compose with `inverted` lists:
    // rows animate to colliding positions and can SETTLE overlapped — the
    // reported "my message and the AI message stick together". PocketPal
    // runs no itemLayoutAnimation on their list either (ChatView.tsx
    // FlatList carries none), so this is the verbatim port line too.
    expect(LIST).not.toMatch(/itemLayoutAnimation/);
    expect(LIST).not.toMatch(/motionLayout/);
  });
});

describe("streaming scroll (PocketPal ChatView.tsx:1089-1096)", () => {
  it("pins the growing turn with their exact MVCP config, gated on streaming", () => {
    expect(LIST).toMatch(
      /maintainVisibleContentPosition=\{\s*streaming\s*\?\s*\{\s*minIndexForVisible: 1,\s*autoscrollToTopThreshold: 20,?\s*\}/,
    );
  });

  it("scrolls ONLY when a new user message lands, to the inverted end", () => {
    // PocketPal's auto-scroll: data[0] flipped to a NEW user message →
    // scrollToOffset 0. Streaming growth is MVCP/inversion's job, not a
    // JS follow effect — the row-count scrollToEnd is GONE.
    expect(LIST).not.toMatch(/scrollToEnd/);
    expect(LIST).toMatch(/scrollToOffset\(\{\s*animated: true,\s*offset: 0\s*\}\)/);
    expect(LIST).toMatch(
      /newest\.message\.role === "user"[\s\S]*scrollToOffset\(\{\s*animated: true,\s*offset: 0\s*\}\)/s,
    );
  });

  it("is no longer told that the composer grew (extraContentPadding gone)", () => {
    expect(LIST).not.toMatch(/extraContentPadding/);
    expect(LIST).not.toMatch(/blankSpace/);
    expect(LIST).not.toMatch(/keyboardLiftBehavior/);
    expect(LIST).not.toMatch(/\bfreeze\b/);
  });
});

describe("the empty state is list content again (PocketPal's flow)", () => {
  it("placeholder and greeting ride as ListEmptyComponent, centred by the container", () => {
    // The overlay existed ONLY to escape KeyboardChatScrollView's dynamic
    // inset (docs/research/2026-10-08). With a plain FlatList the inset is
    // gone, so PocketPal's own placement is back: ListEmptyComponent +
    // flexGrow/justify-center on the empty container.
    expect(CHAT).toMatch(/listEmpty=\{/);
    expect(CHAT).toMatch(/<ChatEmptyPlaceholder/);
    expect(LIST).toContain('ListEmptyComponent={listEmpty ?? undefined}');
    expect(LIST).toMatch(/flexGrow: 1/);
    expect(LIST).toMatch(/justifyContent: "center"/);
  });
});




