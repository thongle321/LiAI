/** Strip rules before speech (ticket 01 / spec Q10): stripForSpeech turns
 * raw assistant text into speakable text — reasoning tags, code, links,
 * tables out; prose in.
 * Run: node --test tests/strip-for-speech.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { stripForSpeech } from "../lib/stripForSpeech.ts";

// Escaped so the tag bytes stay unambiguous in source and output.
const THINK_OPEN = "\u003cthink\u003e";
const THINK_CLOSE = "\u003c/think\u003e";

describe("stripForSpeech: think tags", () => {
  it("drops think-tag content and keeps the prose around it", () => {
    assert.equal(
      stripForSpeech(`Hello ${THINK_OPEN}thinking hard${THINK_CLOSE} bye`),
      "Hello bye",
    );
  });

  it("drops reasoning-tag content the same way", () => {
    assert.equal(
      stripForSpeech("Answer <reasoning>chat with itself</reasoning> now"),
      "Answer now",
    );
  });

  it("drops the remainder when a trailing tag is never closed", () => {
    assert.equal(
      stripForSpeech(`Kept ${THINK_OPEN}never closed`),
      "Kept",
    );
    assert.equal(
      stripForSpeech("Kept <reasoning>never closed"),
      "Kept",
    );
  });
});

describe("stripForSpeech: wiring", () => {
  it("speakReply — the shared path for auto-speak and the play button — strips first", () => {
    const src = readFileSync(
      new URL("../lib/voiceSpeak.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /Speech\.speak\(stripForSpeech\(text\)/);
  });
});

describe("stripForSpeech: tables", () => {
  it("drops table rows and keeps the prose around them", () => {
    assert.equal(
      stripForSpeech(
        "Summary:\n| Name | Size |\n| --- | --- |\n| a | 1 |\nDone.",
      ),
      "Summary:\n\nDone.",
    );
  });
});

describe("stripForSpeech: links and images", () => {
  it("reduces a link to its label", () => {
    assert.equal(
      stripForSpeech("See [the docs](https://example.com/doc) for more."),
      "See the docs for more.",
    );
  });

  it("drops a labelless link entirely", () => {
    assert.equal(
      stripForSpeech("Read [](https://example.com) now."),
      "Read now.",
    );
  });

  it("drops bare URLs", () => {
    assert.equal(
      stripForSpeech("Visit https://example.com/page?a=1 for it."),
      "Visit for it.",
    );
  });

  it("drops image markup entirely", () => {
    assert.equal(
      stripForSpeech("Look: ![a cat](cat.png) here"),
      "Look: here",
    );
  });
});

describe("stripForSpeech: inline markup", () => {
  it("drops inline code spans", () => {
    assert.equal(
      stripForSpeech("Call `npm install` now"),
      "Call now",
    );
  });

  it("strips bold markers but keeps the words", () => {
    assert.equal(
      stripForSpeech("This is **very** important."),
      "This is very important.",
    );
  });
});

describe("stripForSpeech: fenced code blocks", () => {
  it("drops a fenced block and keeps the prose", () => {
    assert.equal(
      stripForSpeech(
        "Run this:\n```ts\nconst x = 1;\n```\nThen done.",
      ),
      "Run this:\n\nThen done.",
    );
  });

  it("drops the remainder when a fence is never closed", () => {
    assert.equal(
      stripForSpeech("Before\n```\nconst x = 1;"),
      "Before",
    );
  });
});

describe("stripForSpeech: whitespace", () => {
  it("collapses space runs and blank-line runs, and trims the ends", () => {
    assert.equal(
      stripForSpeech("  Hello   there.  \n\n\n\n  Bye.  "),
      "Hello there.\n\nBye.",
    );
  });
});
