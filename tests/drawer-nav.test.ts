/** New conversation moved from the drawer row to the chat header (Q1=A).
 * Run: node --test tests/drawer-nav.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const SESSION_LIST = "components/chat/SessionList.tsx";
const DRAWER = "components/AppDrawer.tsx";
const CHAT = "app/(drawer)/(tabs)/chat.tsx";

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

  it("AppDrawer no longer wires the action", () => {
    const source = read(DRAWER);
    assert.doesNotMatch(source, /onNew/);
    assert.doesNotMatch(source, /newConversation/);
  });
});

describe("chat route owns the affordance", () => {
  it("header carries a new-conversation button", () => {
    const source = read(CHAT);
    assert.match(
      source,
      /accessibilityLabel="New conversation"/,
      "the chat header button exists",
    );
    assert.match(source, /newConversation\(\)/, "it runs the store action");
    assert.match(source, /MessageSquarePlus/, "lucide icon, not a text glyph");
  });
});
