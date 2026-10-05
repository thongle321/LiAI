/** In-chat search filter (pure).
 *
 * The Markdown transcript builder that used to share this file was removed:
 * `buildTranscript` in lib/chat/transcript.ts had no production caller — only
 * this test imported it — so it was dead code that a green suite was keeping
 * alive. Markdown export actually goes through lib/chat/export.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { filterMessages } from "../lib/chat/filter.ts";
import type { ChatMessage } from "../types/chat.ts";

function msg(id: string, role: "user" | "assistant", text: string): ChatMessage {
  return { id, role, text, at: 0 };
}

describe("filterMessages", () => {
  const messages = [
    msg("1", "user", "How do I reset my password?"),
    msg("2", "assistant", "Open Settings and tap Reset."),
    msg("3", "user", "Thanks, that worked"),
  ];

  it("matches case-insensitively across roles", () => {
    assert.deepEqual(
      filterMessages(messages, "RESET").map((m) => m.id),
      ["1", "2"],
    );
  });

  it("returns everything on a blank query", () => {
    assert.equal(filterMessages(messages, "   ").length, 3);
  });

  it("returns nothing when nothing matches", () => {
    assert.deepEqual(filterMessages(messages, " refund "), []);
  });
});
