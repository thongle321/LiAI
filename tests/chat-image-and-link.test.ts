/** G15 image enlarge + G16 deep-link prefill (source scans).
 *
 * Scans rather than renders, matching `message-list.test.ts` and
 * `thinking-pill.test.ts`: what these pin are structural facts — where
 * the tap target sits relative to the long-press menu, and that the
 * prefill cannot fire twice — which no rendering assertion would catch.
 *
 * Run: node --test tests/chat-image-and-link.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Repo-relative, block comments stripped so a rule can never be
 *  satisfied by prose describing it. */
function read(file: string): string {
  return readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

const row = read("components/chat/MessageListItem.tsx");
const viewer = read("components/chat/ImageViewer.tsx");
const chat = read("app/(drawer)/(tabs)/chat.tsx");

test("G15: the viewer is a dismissible fullscreen modal", () => {
  assert.match(viewer, /<Modal/, "a Modal, which is on the AGENTS exception list");
  // Android's hardware back dispatches onRequestClose; without it the
  // modal swallows the gesture and the user is stuck.
  assert.match(viewer, /onRequestClose=\{onClose\}/, "hardware back must close it");
  assert.match(viewer, /uri === null\) return null/, "null closes it");
  assert.match(viewer, /resizeMode="contain"/, "the photo is shown whole");
});

test("G15: the close control meets the touch-target floor", () => {
  assert.match(viewer, /className="h-12 w-12 items-center justify-center"/);
});

test("G15: tapping a message image opens it", () => {
  assert.match(row, /setEnlarged\(message\.image \?\? null\)/, "tap sets the uri");
  assert.match(row, /<ImageViewer uri=\{enlarged\}/, "and the viewer is mounted");
});

test("G15: the image stays OUT of the long-press menu", () => {
  // Tap-to-enlarge only works because the image is not wrapped by
  // withMenu. Move it inside and the menu claims the gesture, or a
  // long-press on the photo does nothing at all.
  const imageAt = row.indexOf("source={{ uri: message.image }}");
  const menuAt = row.indexOf("{withMenu(");
  assert.ok(imageAt > -1, "the image renders");
  assert.ok(menuAt > -1, "the bubble goes through the menu");
  assert.ok(imageAt < menuAt, "the image precedes the menu wrapper");
});

test("G16: the prefill reads ?message= and fills once", () => {
  assert.match(
    chat,
    /useLocalSearchParams<\{ message\?: string \}>\(\)/,
    "the param is read off the route",
  );
  // PocketParity: initialInputText + onInitialTextConsumed, i.e. ONCE.
  // Without the ref the effect re-fires each render and stomp the user's
  // typing.
  assert.match(chat, /consumedDeepLink\.current === deepLinkPrompt/);
  // ...and the ref resets once the link is gone, so a REPEATED
  // `?message=hello` fills the field again instead of being swallowed as
  // a duplicate. PocketPal clears the parked message, so it refills.
  assert.match(
    chat,
    /if \(deepLinkPrompt === undefined\) \{[\s\S]*?consumedDeepLink\.current = null;/,
  );
  assert.match(chat, /if \(text !== ""\) setDraft\(text\)/, "seeds the real draft");
});