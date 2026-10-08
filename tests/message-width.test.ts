/** The chat list's one width measurement.
 * Run: node --test tests/message-width.test.ts
 *
 * The bug this locks: the assistant row was `self-start` + `max-w-[75%]`,
 * which made Yoga shrink-wrap the row to its content's INTRINSIC width. A
 * native <Text> reports its full unwrapped width as intrinsic, so the cap
 * limited a row that had already been laid out too wide and the tail of
 * every line was clipped by the list viewport instead of wrapping.
 *
 * A percentage cannot express that away — only a definite width can. So
 * the width is computed once, as a number, and threaded down (PocketPal
 * does exactly this at ChatView.tsx:836-842).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { messageWidths } from "../lib/chat/message-width.ts";

describe("messageWidths", () => {
  it("fits inside the list's own horizontal padding", () => {
    // The list is `contentContainerClassName="p-5"` — 20 a side. Measuring
    // the raw screen width overflows the content box, which is how a 0.92
    // share of the screen becomes ~8px too wide.
    const { assistant, user } = messageWidths(400);
    assert.ok(assistant <= 360, `assistant ${assistant} must fit in 360`);
    assert.ok(user <= 360, `user ${user} must fit in 360`);
  });

  it("gives the unboxed assistant prose more room than the filled bubble", () => {
    // EXACT pixels, not a ratio between the two: an "assistant > user"
    // assertion passes with ASSISTANT_SHARE at 0.5, which is not the 0.92
    // the port agreed. 360 is the available width at a 400px screen, and
    // 331/288 is floor(0.92 * 360) / floor(0.80 * 360) — the shares are
    // pinned by the pixels, so no float comparison is needed.
    assert.deepEqual(messageWidths(400), { assistant: 331, user: 288 });
  });

  it("stops growing on a tablet", () => {
    // PocketPal caps at 900 so a large screen does not get a 9000px line.
    // Share first, cap second (`min(width * 0.92, 900)`): capping the
    // available width instead would leave the assistant stuck at 828 and
    // never reach the 900 the cap exists to allow.
    assert.deepEqual(messageWidths(2560), { assistant: 900, user: 900 });
    // Just under the knee: the share still applies while it fits.
    assert.deepEqual(messageWidths(1000), { assistant: 883, user: 768 });
  });

  it("never returns a negative width on a very narrow screen", () => {
    // A degenerate width must not produce a negative maxWidth, which
    // Yoga treats as "no constraint" and the clipping comes back.
    const narrow = messageWidths(20);
    assert.ok(narrow.assistant >= 0);
    assert.ok(narrow.user >= 0);
  });

  it("is whole pixels, because it lands in a style", () => {
    const { assistant, user } = messageWidths(411);
    assert.equal(Number.isInteger(assistant), true);
    assert.equal(Number.isInteger(user), true);
  });
});
