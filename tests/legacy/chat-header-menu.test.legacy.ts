/** Header search moved into the 3-dot menu; the pen is PocketPal's
 * reset-button replica (grilling: "Yes all").
 * Run: node --test tests/chat-header-menu.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const CHAT = "app/(drawer)/(tabs)/chat.tsx";
const MENU = "components/chat/ChatMenu.tsx";

describe("chat header", () => {
  it("dropped the search button", () => {
    const source = read(CHAT);
    assert.doesNotMatch(source, /accessibilityLabel=\{searchOpen/, "button gone");
    assert.doesNotMatch(source, /<Search /, "search icon no longer in the header");
    assert.doesNotMatch(source, /searchPress/, "its press feedback is gone too");
  });

  it("leads the trailing group with the pocketpal pen", () => {
    const source = read(CHAT);
    assert.match(source, /SquarePen/, "compose-box glyph, pocketpal's edit-box shape");
    assert.match(source, /accessibilityLabel="New conversation"/);
    assert.match(source, /newConversation\(\)/, "pen = new conversation only");
    assert.match(
      source,
      /setSearchOpen\(false\)/,
      "a fresh chat must not open on a stale search",
    );
    assert.match(
      source,
      /SquarePen[\s\S]*?<ChatMenu/,
      "pen sits LEFT of the kebab (pocketpal order)",
    );
    assert.match(source, /onOpenSearch=\{/, "the menu receives the callback");
  });
});

describe("chat menu", () => {
  it("gains Search as the first session-group row", () => {
    const source = read(MENU);
    assert.match(source, /onOpenSearch/, "the callback prop exists");
    assert.match(
      source,
      /hasSession \? \(\s*<>[\s\S]*?label="Search"/,
      "Search leads the session-gated group",
    );
    assert.ok(
      source.indexOf('label="Search"') < source.indexOf("Duplicate chat history"),
      "Search precedes Duplicate",
    );
    assert.match(
      source,
      /label="Search"[\s\S]*?onOpenSearch/,
      "its row opens search",
    );
  });
});
