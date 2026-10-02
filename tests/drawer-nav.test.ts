/** New conversation's HOME moved: drawer row -> header + -> drawer Chat
 * tab, with the pocketpal pen as the in-header entry (Q1=A + "Yes all").
 * The chat HEADER is pinned by tests/chat-header-menu.test.ts, not here.
 * Run: node --test tests/drawer-nav.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const SESSION_LIST = "components/chat/SessionList.tsx";
const DRAWER = "components/AppDrawer.tsx";

describe("drawer has no new-conversation row", () => {
  it("SessionList dropped the row and its onNew prop", () => {
    const source = read(SESSION_LIST);
    assert.doesNotMatch(source, /onNew/, "the onNew prop is gone");
    assert.doesNotMatch(
      source,
      /accessibilityLabel="New conversation"/,
      "the row button is gone",
    );
    // The empty-session TITLE fallback stays — that is a label, not an action.
    assert.match(source, /"New conversation" \? |=== "" \? "New conversation"/);
  });

  it("AppDrawer no longer wires the old row action", () => {
    const source = read(DRAWER);
    assert.doesNotMatch(source, /onNew/);
    // newConversation IS present — as the Chat tab's action (Q1=A),
    // asserted by the suite below; what is gone is the SessionList row.
  });
});

describe("drawer owns a Chat tab like pocketpal", () => {
  it("leads the footer nav, navigates to chat, and starts fresh (Q1=A)", () => {
    const source = read(DRAWER);
    assert.match(source, /label="Chat"/, "the Chat item exists");
    assert.match(source, /go\("\/chat"\)/, "it navigates to the chat route");
    assert.match(source, /newConversation\(\)/, "it starts a fresh conversation");
    assert.match(source, /MessageCircle/, "lucide icon");
    // First in the footer group: Chat leads the menu order.
    assert.match(
      source,
      /label="Chat"[\s\S]*?label="Models"/,
      "Chat precedes Models",
    );
    assert.doesNotMatch(source, /onNew/);
  });
});
