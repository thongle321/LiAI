import { test } from "node:test";
import { strict as assert } from "node:assert";

import { isServerUrl } from "../lib/models/server-url.ts";

test("isServerUrl accepts valid HTTP(S) URLs", () => {
  assert.equal(isServerUrl("http://example.com"), true);
  assert.equal(isServerUrl("https://example.com"), true);
  assert.equal(isServerUrl("https://example.com/"), true);
  assert.equal(
    isServerUrl("https://example.com/path?q=1#frag"),
    true,
  );
});

test("isServerUrl trims surrounding whitespace before validating", () => {
  assert.equal(isServerUrl("  https://example.com  "), true);
});

test("isServerUrl rejects non-http(s) schemes", () => {
  assert.equal(isServerUrl("ftp://example.com"), false);
  assert.equal(isServerUrl("file:///etc/passwd"), false);
  assert.equal(isServerUrl("javascript:alert(1)"), false);
  // PocketPal note: trailing slash retained; scheme-only rejected only
  // when hostname is empty.
});

test("isServerUrl rejects scheme with empty hostname", () => {
  assert.equal(isServerUrl("http://"), false);
  assert.equal(isServerUrl("https://"), false);
  // Inputs that do not parse.
  assert.equal(isServerUrl(""), false);
  assert.equal(isServerUrl("not a url"), false);
  assert.equal(isServerUrl("localhost:8080"), false);
});

test("isServerUrl rejects non-string payloads", () => {
  // Defensive: callers should wrap; helper only is typed on (string).
  assert.equal(isServerUrl("  "), false);
});
