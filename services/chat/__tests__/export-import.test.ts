/** Export/import round-trip tests for PocketPal parity features.
 *
 * Tests:
 * - Session creation date preservation (drawer grouping)
 * - Author identity persistence
 * - Photo (image) persistence through export/import
 */

import { parseImport, type ImportOutcome } from "../import.ts";
import { toMarkdown, toSessionJson, toAllSessionsJson, type ExportSession } from "../export.ts";
import { toSession } from "../messages.ts";
import { DEFAULT_SAMPLER } from "@/services/inference/sampler.ts";
import type { SessionInfo } from "@/types/chat.ts";
import type { StoredMessage, StoredTurn } from "../session-store.ts";

// Helper to build a minimal valid export session
function makeExportSession(
  id: string,
  title: string,
  turns: StoredTurn[],
): ExportSession {
  return {
    id,
    title,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
    // Add synthetic ids for the read shape (StoredMessage)
    turns: turns.map((t, i) => ({ ...t, id: `${id}-t${i + 1}` })),
  };
}

// Helper to create a JSON export from an ExportSession
function exportSessionJson(session: ExportSession): string {
  return JSON.stringify({
    format: "liai-chat-session",
    version: 1,
    id: session.id,
    title: session.title,
    pinned: session.pinned,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    turns: session.turns,
  });
}

describe("export/import createdAt persistence", () => {
  it("round-trips createdAt through export and import", async () => {
    const createdAt = "2024-01-15T10:30:00.000Z";
    const session: ExportSession = makeExportSession("s-1", "Test Session", [
      { role: "user", content: "hello", at: Date.now() },
      { role: "assistant", content: "hi there", at: Date.now() + 1000 },
    ]);
    session.createdAt = createdAt;

    const json = exportSessionJson(session);
    const result = parseImport(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions[0].createdAt).toEqual(createdAt);
    }
  });

  it("handles missing createdAt on import (legacy fallback)", () => {
    // Simulate a legacy JSON export (created before createdAt was added)
    const legacyJson = JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      id: "s-2",
      title: "Legacy Session",
      pinned: false,
      // No createdAt field - legacy export
      updatedAt: Date.now(),
      turns: [
        { role: "user", content: "old message", at: Date.now() },
      ],
    });

    const result = parseImport(legacyJson);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions[0].createdAt).toBeUndefined();
    }
  });

  it("uses custom createdAt over default when present", () => {
    const createdAt = "2023-12-25T00:00:00.000Z";
    const session: ExportSession = makeExportSession("s-3", "Christmas Chat", [
      { role: "user", content: "Merry Christmas?", at: 1703500000000 },
      { role: "assistant", content: "Merry Christmas to you too!", at: 1703500000000 + 500 },
    ]);
    session.createdAt = createdAt;

    const result = parseImport(JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      id: session.id,
      title: session.title,
      pinned: session.pinned,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      turns: session.turns,
    }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions[0].createdAt).toEqual(createdAt);
    }
  });
});

describe("toSession createdAt grouping", () => {
  it("uses createdAt for age grouping when present", () => {
    const row: SessionInfo = {
      id: "s-test",
      title: "Test",
      pinned: false,
      updatedAt: Date.now(),
      createdAt: "2024-01-15T10:30:00.000Z",
    };

    const session = toSession(row);
    expect(session.id).toEqual("s-test");
    expect(session.title).toEqual("Test");
    // createdAt is used for the 'at' timestamp for drawer grouping
    expect(session.at).toEqual(new Date("2024-01-15T10:30:00.000Z").getTime());
  });

  it("falls back to updatedAt when createdAt is not present (legacy)", () => {
    const row: SessionInfo = {
      id: "s-legacy",
      title: "Old Session",
      pinned: false,
      updatedAt: 1704067200000, // 2024-01-01
    };

    const session = toSession(row);
    expect(session.id).toEqual("s-legacy");
    // Falls back to updatedAt
    expect(session.at).toEqual(1704067200000);
  });
});

describe("export/import images persistence", () => {
  it("round-trips images through export and import", () => {
    const session: ExportSession = makeExportSession("s-4", "With Photos", [
      { role: "user", content: "Here's a photo", at: Date.now(), images: ["file://photo1.jpg"] },
      { role: "assistant", content: "I can see it!", at: Date.now() + 1000 },
    ]);

    const json = JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      id: session.id,
      title: session.title,
      pinned: session.pinned,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      turns: session.turns.map(({ id: _, ...t }) => t),
    });

    const result = parseImport(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions[0].turns[0].images).toEqual(["file://photo1.jpg"]);
    }
  });

  it("handles multiple images on a turn", () => {
    const session: ExportSession = makeExportSession("s-5", "Multi-Photo", [
      {
        role: "user",
        content: "Compare these",
        at: Date.now(),
        images: ["file://a.jpg", "file://b.jpg", "file://c.jpg"],
      },
    ]);

    const json = JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      id: session.id,
      title: session.title,
      pinned: session.pinned,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      turns: session.turns.map(({ id: _, ...t }) => t),
    });

    const result = parseImport(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions[0].turns[0].images).toEqual([
        "file://a.jpg",
        "file://b.jpg",
        "file://c.jpg",
      ]);
    }
  });

  it("drops images that exceed the limit", () => {
    // Create more than 10 images to test the limit
    const images = Array.from({ length: 15 }, (_, i) => `file://photo${i}.jpg`);
    const session: ExportSession = makeExportSession("s-6", "Many Photos", [
      { role: "user", content: "Too many", at: Date.now(), images },
    ]);

    const json = JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      id: session.id,
      title: session.title,
      pinned: session.pinned,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      turns: session.turns.map(({ id: _, ...t }) => t),
    });

    const result = parseImport(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only first 10 should be kept
      expect(result.sessions[0].turns[0].images).toHaveLength(10);
      expect(result.sessions[0].turns[0].images?.[0]).toEqual("file://photo0.jpg");
      expect(result.sessions[0].turns[0].images?.[9]).toEqual("file://photo9.jpg");
    }
  });
});

describe("export/import author identity", () => {
  it("imports authorId and author for display purposes", () => {
    // Author fields are preserved in export/import for imported data display
    const session: ExportSession = makeExportSession("s-7", "Author Test", [
      { role: "user", content: "Hello", at: Date.now(), authorId: "user", author: { name: "John" } },
      { role: "assistant", content: "Hi!", at: Date.now() + 500, authorId: "assistant", author: { name: "LiAI" } },
    ]);

    const json = JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      id: session.id,
      title: session.title,
      pinned: session.pinned,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      turns: session.turns.map(({ id: _, ...t }) => t),
    });

    const result = parseImport(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Note: authorId and author are imported for display purposes on imported data
      // They are not in droppedRich since they're intentionally preserved for imports
      expect(result.sessions[0].turns[0].authorId).toEqual("user");
      expect(result.sessions[0].turns[0].author?.name).toEqual("John");
      expect(result.sessions[0].turns[1].authorId).toEqual("assistant");
      expect(result.sessions[0].turns[1].author?.name).toEqual("LiAI");
    }
  });
});

describe("bulk session export/import", () => {
  it("exports multiple sessions with toAllSessionsJson", () => {
    const sessions: ExportSession[] = [
      makeExportSession("s-1", "First", [
        { role: "user", content: "Hello", at: Date.now() },
      ]),
      makeExportSession("s-2", "Second", [
        { role: "user", content: "Hi", at: Date.now() },
        { role: "assistant", content: "Hey!", at: Date.now() + 1000 },
      ]),
    ];
    sessions[0].createdAt = "2024-01-01T00:00:00.000Z";
    sessions[1].createdAt = "2024-01-02T00:00:00.000Z";

    const json = toAllSessionsJson(sessions);
    const parsed = JSON.parse(json);

    expect(parsed.format).toEqual("liai-chat-sessions");
    expect(parsed.sessions).toHaveLength(2);
    expect(parsed.sessions[0].createdAt).toEqual("2024-01-01T00:00:00.000Z");
    expect(parsed.sessions[1].createdAt).toEqual("2024-01-02T00:00:00.000Z");
  });

  it("imports multiple sessions from bulk export", () => {
    const bulkExport = JSON.stringify({
      format: "liai-chat-sessions",
      version: 1,
      sessions: [
        {
          title: "Session A",
          pinned: false,
          createdAt: "2024-01-01T00:00:00.000Z",
          turns: [
            { role: "user", content: "Ask A", at: 1 },
          ],
        },
        {
          title: "Session B",
          pinned: true,
          createdAt: "2024-01-02T12:00:00.000Z",
          turns: [
            { role: "user", content: "Ask B", at: 1 },
            { role: "assistant", content: "Answer B", at: 2 },
          ],
        },
      ],
    });

    const result = parseImport(bulkExport);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].title).toEqual("Session A");
      expect(result.sessions[0].createdAt).toEqual("2024-01-01T00:00:00.000Z");
      expect(result.sessions[1].pinned).toBe(true);
      expect(result.sessions[1].createdAt).toEqual("2024-01-02T12:00:00.000Z");
    }
  });
});

describe("toMarkdown export", () => {
  it("exports sessions as markdown without images or author", () => {
    const session: ExportSession = makeExportSession("s-8", "Markdown Test", [
      { role: "user", content: "What is AI?", at: Date.now() },
      { role: "assistant", content: "AI is artificial intelligence.", at: Date.now() + 1000 },
    ]);

    const md = toMarkdown(session);

    expect(md).toContain("# Markdown Test");
    expect(md).toContain("## You");
    expect(md).toContain("What is AI?");
    expect(md).toContain("## LiAI");
    expect(md).toContain("AI is artificial intelligence.");
  });
});