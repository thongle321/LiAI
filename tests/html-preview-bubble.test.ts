/** HTML preview bubble: the sandbox config, pinned by source.
 *
 * The WebView cannot be exercised under node (react-native-webview is a
 * native module, like lib/chat/share-export.ts), so its CONFIG is asserted
 * by reading the component as text — the established pattern in this repo
 * (see tests/session-bulk.test.ts).
 *
 * This matters more than a usual source test. The flags below ARE the
 * sandbox: the CSP deliberately allows inline script so the fullscreen
 * mode can run it, which means `javaScriptEnabled` is the only thing
 * stopping model-authored script from running inside a bubble. A stray
 * edit that flipped that flag would be invisible in review and would ship
 * model script into the message list.
 *
 * Run: node --test tests/html-preview-bubble.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const src = readFileSync(
  path.join(ROOT, "components/chat/HtmlPreviewBubble.tsx"),
  "utf8",
);

/** The two WebView blocks, in source order: bubble, then fullscreen. */
const webviews = [...src.matchAll(/<WebView[\s\S]*?\/>/g)].map((m) => m[0]);

test("there are exactly two WebViews: collapsed and fullscreen", () => {
  assert.equal(webviews.length, 2);
});

test("the in-bubble WebView runs NO script", () => {
  const collapsed = webviews[0] ?? "";
  assert.match(collapsed, /javaScriptEnabled=\{false\}/);
  assert.match(collapsed, /testID="html-preview-webview"/);
});

test("fullscreen is the only place script runs", () => {
  const full = webviews[1] ?? "";
  assert.match(full, /javaScriptEnabled\b(?!=\{false\})/);
  assert.match(full, /testID="html-preview-modal-webview"/);
});

test("both are locked to about:blank, so a document cannot navigate away", () => {
  for (const [index, view] of webviews.entries()) {
    assert.match(
      view,
      /originWhitelist=\{\["about:blank"\]\}/,
      `webview ${index} must restrict the origin whitelist`,
    );
    assert.match(
      view,
      /onShouldStartLoadWithRequest=\{onlyAboutBlank\}/,
      `webview ${index} must refuse foreign loads`,
    );
    assert.match(
      view,
      /baseUrl: "about:blank"/,
      `webview ${index} must load from about:blank`,
    );
  }
});

test("the load guard actually compares against about:blank", () => {
  // The guard is a callback defined apart from the JSX; assert its body,
  // since a permissive edit there would widen both WebViews at once.
  assert.match(
    src,
    /const onlyAboutBlank = useCallback\([\s\S]*?req\.url === "about:blank"[\s\S]*?\)/,
    "the guard must admit only about:blank",
  );
});

test("the preview is sandboxed by the flag, not by CSP alone", () => {
  // Guards against someone "simplifying" by trusting the meta tag: the
  // policy must still permit inline script (fullscreen needs it), so the
  // disabled flag is doing the real work in the bubble.
  assert.match(
    src,
    /javaScriptEnabled=\{false\}/,
    "the bubble relies on the JS flag; CSP cannot enforce this",
  );
});

test("copy takes the RAW html, not the wrapped document", () => {
  assert.match(src, /Clipboard\.setStringAsync\(html\)/);
  assert.doesNotMatch(
    src,
    /Clipboard\.setStringAsync\(wrappedHtml\)/,
    "copying the wrapper would hand the user our CSP injection",
  );
});