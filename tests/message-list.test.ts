/** Message-list stability mechanics (source scans).
 *
 * PocketPal ChatView §§1+6, adapted: our list stays KeyboardChatScrollView
 * (the library owns the keyboard inset), and these scans lock the three
 * mechanics layered on top of it — visible-content pinning while
 * streaming, and the STICK/LEAVE end tracker as the single at-end source.
 *
 * Run: node --test tests/message-list.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(file: string): string {
  return readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("message list stability", () => {
  it("pins visible content while tokens stream", () => {
    // PocketPal ChatView.tsx:1022 — same thresholds. Gated on the streaming
    // prop: a pinned list outside streaming would fight the reader's own
    // scrolling. iOS-only prop, a no-op on Android.
    const list = read("components/chat/MessageList.tsx");
    assert.match(list, /maintainVisibleContentPosition=\{/);
    assert.match(list, /minIndexForVisible: 1/);
    assert.match(list, /autoscrollToTopThreshold: 20/);
    assert.match(
      list,
      /streaming\s*\?\s*\{\s*minIndexForVisible/,
      "pinning must be gated on streaming",
    );
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(
      chat,
      /streaming=\{streaming\}/,
      "the chat route feeds its streaming flag into the list",
    );
  });

  it("renders adapter rows: flagged turns, with no day dividers", () => {
    // buildRows owns grouping/avatar/status/date derivation; the list and
    // the bubble consume rows without re-deriving — one derivation, or the
    // parts disagree about what a group is.
    const list = read("components/chat/MessageList.tsx");
    assert.match(list, /rows: ChatRow\[\]/);
    assert.match(
      list,
      /renderRow: \(row: ChatRow, widths: MessageWidths\)/,
      "the list threads its one width measurement into every row",
    );
    assert.match(
      list,
      /keyExtractor=\{\(row\) => \(row\.kind === "message" \? row\.message\.id : row\.id\)\}/,
    );
    assert.doesNotMatch(list, /renderBubble/, "rows replaced the message-only render prop");
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(chat, /buildRows\(visible, \{ sending, stopping \}\)/);
    assert.match(chat, /useMemo\(\s*\(\) => buildRows/, "rows memoized: new identity must not retrigger follow");
    assert.doesNotMatch(
      chat,
      /DateHeader/,
      "no day dividers: PocketPal's showDateHeaders defaults false, so their list — and ours — renders none",
    );
    const item = read("components/chat/MessageListItem.tsx");
    // One row in, not three flags: the adapter's flags travel together.
    assert.match(item, /row: MessageRow/);
    assert.doesNotMatch(item, /grouped: boolean/, "flags arrive bundled, not as siblings");
    assert.match(item, /status === "sending"/);
  });

  it("gives the assistant row no furniture, and no avatar file", () => {
    // PocketParity. Their Avatar returns null for assistant rows (it needs
    // showUserAvatars, default false) and their sender name is off by
    // default too, so an assistant turn is bare text on the page. Ours
    // matched that, which deleted the component outright — the assertion
    // that matters is that nothing can quietly bring it back.
    const item = read("components/chat/MessageListItem.tsx");
    assert.doesNotMatch(item, /AssistantAvatar/, "the avatar is deleted, not restyled");
    assert.doesNotMatch(item, /APP_NAME/, "no sender label above assistant prose");
    assert.throws(
      () => readFileSync("components/chat/AssistantAvatar.tsx"),
      /ENOENT/,
      "AssistantAvatar.tsx must stay deleted",
    );
    const pending = read("components/chat/PendingIndicator.tsx");
    assert.doesNotMatch(pending, /AssistantAvatar/, "nor on the pending row");
  });

  it("threads one measured width instead of a percentage cap", () => {
    // The clipping bug: `self-start` + `max-w-[75%]` shrink-wrapped the row
    // to its content's INTRINSIC width (a native <Text> reports its full
    // unwrapped width as intrinsic), so the cap limited a row already laid
    // out too wide and the viewport clipped the tail of every line.
    // lib/chat/message-width.ts has the arithmetic and its own tests.
    // Code only: the comment above the row explains the bug and quotes the
    // very cap being removed, so an unstripped scan matches itself.
    const code = read("components/chat/MessageListItem.tsx").replace(
      /^\s*\/\/.*$/gm,
      "",
    );
    assert.match(code, /style=\{\{ maxWidth: widths\.assistant \}\}/);
    assert.match(code, /style=\{\{ maxWidth: widths\.user \}\}/);
    assert.match(code, /<MarkdownView text=\{block\.text\} maxWidth=\{widths\.assistant\}/);
    assert.doesNotMatch(code, /max-w-\[7[05]%\]|max-w-\[80%\]/, "percentage caps are gone");
    const list = read("components/chat/MessageList.tsx");
    assert.match(list, /useWindowDimensions/);
    assert.match(list, /messageWidths\(windowWidth\)/);
  });

  it("renders the pending row for the active run, with no second chip", () => {
    // The pending row scrolls with the list; the old "LiAI…" overlay chip
    // duplicated the same state (sending coincides with the streaming stub
    // — send/retry/regenerate mint both in one set()) while overlapping
    // content instead of scrolling with it.
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    // `\b` not `\/>`: the indicator takes a startedAt prop now (G13), so
    // the self-closing form is gone. The intent here is WHERE the row
    // renders -- in the list, not as an overlay chip -- and that is
    // unaffected by the prop.
    assert.match(chat, /row\.kind === "pending" \? \(\s*<PendingIndicator\b/);
    assert.match(
      chat,
      /import \{ PendingIndicator \} from "\.\.\/\.\.\/\.\.\/components\/chat\/PendingIndicator\.tsx"/,
    );
    assert.doesNotMatch(chat, /LiAI…/, "the overlay chip must stay deleted");
    const list = read("components/chat/MessageList.tsx");
    assert.match(
      list,
      /keyExtractor=\{\(row\) => \(row\.kind === "message" \? row\.message\.id : row\.id\)\}/,
    );
    const pending = read("components/chat/PendingIndicator.tsx");
    assert.match(pending, /withRepeat\(withTiming/);
    assert.doesNotMatch(
      pending,
      /useReducedMotion|ReducedMotion/,
      "dots always animate like PocketPal: no OS reduce-motion branch",
    );
  });

it("renders all three user-row delivery states", () => {
    // Source assertion, not a render: the only claim is which JSX branch a
    // status takes, and the node runner has no React Native to render it.
    // The state values themselves are tested as logic in chat-rows.test.ts.
    const item = read("components/chat/MessageListItem.tsx");
    assert.match(item, /status === "sending"/, "sending keeps the spinner");
    assert.match(item, /status === "failed"/, "failed takes its own branch");
    assert.match(item, /<CircleAlert[^>]*color=\{colors\.error\}/, "Lucide, error token");
    // No emoji or text glyphs standing in for the icon (repo icon rule).
    assert.doesNotMatch(item, /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u);
  });

  it("routes a failed turn to the snackbar, not a card in the list", () => {
    // PocketParity. Ours had a red bordered card with "— tap to retry"
    // inline in the list; PocketPal has no error bubble at all — the
    // reason and the retry affordance go to the snackbar, which is the
    // mechanism PocketParity G7 already built here. A failed turn renders
    // as an ordinary turn holding whatever partial text arrived.
    //
    // The three assertions below are the WIRING, and each one is a way
    // this broke: deleting the card without any of them leaves a failed
    // turn completely silent. Asserting only that ChatWarningSnackbar.tsx
    // *mentions* onRetry passed against exactly that broken state, so the
    // checks are on the two call sites that must supply it.
    const item = read("components/chat/MessageListItem.tsx");
    assert.doesNotMatch(item, /card--error/, "the red card is deleted, not restyled");
    assert.doesNotMatch(item, /tap to retry/, "retry now rides the snackbar");

    // 1. The failure must RAISE the warning — deleting the card removed the
    //    only place the reason was ever shown.
    const send = read("store/chat/send.ts");
    assert.match(
      send,
      /chatWarning: \{ message: error\.message, severity: "error", recoverable: true \}/,
      "a failed turn must raise a recoverable error warning",
    );
    // 2. The screen must HAND the snackbar its retry.
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(
      chat,
      /<ChatWarningSnackbar[\s\S]*?onRetry=\{retryFailedTurn\}/,
      "the snackbar needs a retry handler or the warning is read-only",
    );
    assert.match(
      chat,
      /const retryFailedTurn = \(\) => \{[\s\S]*?if \(m\.error !== undefined\) \{[\s\S]*?void retry\(m\.id\)/,
      "retry must reach the store for the turn that actually failed",
    );
    // 3. And the store must still accept it.
    const store = read("store/chat/send.ts");
    assert.match(store, /retry: async \(messageId: string\)/, "retry must stay callable");
  });

  it("windows the render pass at PocketPal's caps", () => {
    // PocketPal ChatView.tsx:997,1001 — initialNumToRender:10,
    // maxToRenderPerBatch:6 (audit item 14, ticket 10).
    // These are FlatList virtualization knobs: they only mean anything to a
    // mounted RN list, so their behaviour is unreachable from `node --test`
    // — pin the values by source assertion instead of faking a render.
    const list = read("components/chat/MessageList.tsx");
    assert.match(list, /initialNumToRender=\{10\}/);
    assert.match(list, /maxToRenderPerBatch=\{6\}/);
  });

  it("tracks the end with STICK/LEAVE hysteresis from one source", () => {
    // PocketPal ChatView.tsx:451 — re-arm below 24px, leave above 40px.
    // The library flips on a single 20px line with no hysteresis
    // (useChatKeyboard/helpers.js: AT_END_THRESHOLD), so consuming its
    // onEndVisible alongside a manual tracker would be two sources for one
    // flag — the disagreement pattern this codebase bans.
    const list = read("components/chat/MessageList.tsx");
    assert.match(list, /STICK_DISTANCE = 24/);
    assert.match(list, /LEAVE_DISTANCE = 40/);
    assert.doesNotMatch(
      list,
      /onEndVisible=\{/,
      "the library signal must not be consumed: the manual tracker is the single source",
    );
    assert.match(list, /onScroll=\{handleScroll\}/);
    assert.match(list, /onContentSizeChange=\{handleContentSizeChange\}/);
    // Transitions call out, steady state stays silent — or every scroll
    // frame re-renders the screen through setAtEnd.
    assert.match(list, /if \(next !== atEndRef\.current\)/);
  });
});
