/** In-chat search filter + Markdown transcript builder (pure). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { filterMessages } from "../lib/chat/filter.ts";
import { buildTranscript } from "../lib/chat/transcript.ts";
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

describe("buildTranscript", () => {
  it("renders a titled Markdown transcript with role headers", () => {
    const out = buildTranscript(
      [msg("1", "user", "Hi"), msg("2", "assistant", "Hello!")],
      "Soul food",
    );
    assert.equal(
      out,
      "# Soul food\n\n**You:**\n\nHi\n\n**LiAI:**\n\nHello!\n",
    );
  });

  it("falls back to an untitled header and skips empty texts", () => {
    const out = buildTranscript([msg("1", "assistant", "")], undefined);
    assert.equal(out, "# Chat export\n");
  });
});
