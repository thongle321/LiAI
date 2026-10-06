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

  it("renders adapter rows: date headers plus flagged turns", () => {
    // buildRows owns grouping/avatar/status/date derivation; the list and
    // the bubble consume rows without re-deriving — one derivation, or the
    // parts disagree about what a group is.
    const list = read("components/chat/MessageList.tsx");
    assert.match(list, /rows: ChatRow\[\]/);
    assert.match(list, /renderRow: \(row: ChatRow\)/);
    assert.match(
      list,
      /keyExtractor=\{\(row\) => \(row\.kind === "message" \? row\.message\.id : row\.id\)\}/,
    );
    assert.doesNotMatch(list, /renderBubble/, "rows replaced the message-only render prop");
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(chat, /buildRows\(visible, \{ sending, stopping \}\)/);
    assert.match(chat, /useMemo\(\s*\(\) => buildRows/, "rows memoized: new identity must not retrigger follow");
    assert.match(chat, /<DateHeader label=\{row\.label\} \/>/);
    const item = read("components/chat/MessageListItem.tsx");
    // One row in, not three flags: the adapter's flags travel together.
    assert.match(item, /row: MessageRow/);
    assert.doesNotMatch(item, /grouped: boolean/, "flags arrive bundled, not as siblings");
    assert.match(item, /<AssistantAvatar shown=\{showAvatar\} \/>/);
    assert.match(item, /status === "sending"/);
    assert.match(item, /!grouped && \(/);
    const avatar = read("components/chat/AssistantAvatar.tsx");
    assert.match(avatar, /if \(!shown\) return <View className="mr-2 w-8" \/>/);
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
    // The assistant-side error card is ours and stays: parity here is the
    // row's status, not a downgrade of LiAI's tap-to-retry card.
    assert.match(item, /message\.error/);
    assert.match(item, /tap to retry/);
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
