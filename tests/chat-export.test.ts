/** Export serialisation: a conversation as Markdown, and as JSON.
 *
 * Pure on purpose, so the format is pinned by tests rather than by opening
 * a file on a device. The file-writing half (cacheDirectory + the share
 * sheet) is the untestable part and lives in the component.
 *
 * Run: node --test tests/chat-export.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  exportFilename,
  toAllSessionsJson,
  toMarkdown,
  toSessionJson,
  type ExportSession,
} from "../lib/chat/export.ts";

const session: ExportSession = {
  id: "s-1",
  title: "Kitting a shelf",
  pinned: false,
  updatedAt: 1_700_000_000_000,
  turns: [
    { role: "user", content: "How do I fix a wobbly shelf?", at: 1_700_000_000_000 },
    {
      role: "assistant",
      content: "Check the wall anchors first.",
      at: 1_700_000_001_000,
      steps: [
        { id: "s1", tool: "read_page", position: 0, input: { query: "shelf anchors" } },
        { id: "s2", tool: "web_search", position: 1, result: "3 results" },
      ],
    },
  ],
};

describe("markdown export", () => {
  it("leads with the title as a heading", () => {
    assert.match(toMarkdown(session), /^# Kitting a shelf\n/);
  });

  it("labels who said what", () => {
    const md = toMarkdown(session);
    assert.ok(md.includes("## You\n"));
    assert.ok(md.includes("## LiAI\n"));
    assert.ok(md.includes("Check the wall anchors first."));
  });

  it("keeps the turns in order", () => {
    const md = toMarkdown(session);
    assert.ok(md.indexOf("How do I fix a wobbly shelf?") < md.indexOf("Check the wall anchors first."));
  });

  it("lists tool calls in call order, not the order stored", () => {
    // position is the only ordering key (ADR-0012), so out-of-order input
    // must still export in call order.
    const shuffled: ExportSession = {
      ...session,
      turns: [
        {
          role: "assistant",
          content: "done",
          steps: [
            { id: "b", tool: "web_search", position: 1 },
            { id: "a", tool: "read_page", position: 0 },
          ],
        },
      ],
    };
    const md = toMarkdown(shuffled);
    assert.ok(md.indexOf("read_page") < md.indexOf("web_search"));
  });

  it("escapes a heading so a user title cannot break the structure", () => {
    // A title is user text: a newline followed by "# " would otherwise
    // forge a section heading in the exported file.
    const md = toMarkdown({ ...session, title: "Line one\n# Not a heading" });
    assert.ok(md.includes("Line one"));
    assert.equal(md.split("\n").filter((l) => l.startsWith("# ")).length, 1);
  });

  it("survives a session with no turns", () => {
    const md = toMarkdown({ ...session, turns: [] });
    assert.ok(md.startsWith("# Kitting a shelf"));
  });

  it("survives a session with no title", () => {
    const md = toMarkdown({ ...session, title: "" });
    assert.ok(md.startsWith("# "), "it still has a heading, not a broken file");
  });
});

describe("json export", () => {
  it("round-trips the whole session, tool calls included", () => {
    const parsed = JSON.parse(toSessionJson(session));
    assert.equal(parsed.title, "Kitting a shelf");
    assert.equal(parsed.turns.length, 2);
    assert.equal(parsed.turns[1].steps.length, 2);
    assert.equal(parsed.turns[1].steps[0].tool, "read_page");
  });

  it("names the format, so a later import can recognise it", () => {
    const parsed = JSON.parse(toSessionJson(session));
    assert.equal(parsed.format, "liai-chat-session");
    assert.equal(parsed.version, 1);
  });

  it("keeps the pinned flag and the id", () => {
    const parsed = JSON.parse(toSessionJson(session));
    assert.equal(parsed.id, "s-1");
    assert.equal(parsed.pinned, false);
  });

  it("writes every session when exporting all of them", () => {
    const parsed = JSON.parse(
      toAllSessionsJson([session, { ...session, id: "s-2", title: "Second" }]),
    );
    assert.equal(parsed.format, "liai-chat-sessions");
    assert.equal(parsed.sessions.length, 2);
    assert.deepEqual(
      parsed.sessions.map((s: { title: string }) => s.title),
      ["Kitting a shelf", "Second"],
    );
  });

  it("writes an empty list rather than nothing for no sessions", () => {
    const parsed = JSON.parse(toAllSessionsJson([]));
    assert.deepEqual(parsed.sessions, []);
  });
});

describe("export filenames", () => {
  it("names each kind distinctly", () => {
    assert.equal(exportFilename(session, "markdown"), "Kitting a shelf.md");
    assert.equal(exportFilename(session, "session"), "liai-session.json");
    assert.equal(exportFilename(session, "all"), "liai-sessions.json");
  });

  it("falls back when a title would make a bad filename", () => {
    // A path separator in a title would write outside the cache dir, and
    // most Android filesystems reject these characters outright.
    const nasty: ExportSession = { ...session, title: "a/b:c*d?e" };
    assert.equal(exportFilename(nasty, "markdown"), "a-b-c-d-e.md");
    assert.equal(exportFilename({ ...session, title: "" }, "markdown"), "liai-chat.md");
  });
});
