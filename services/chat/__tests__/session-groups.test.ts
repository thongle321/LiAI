/** Session date grouping tests (drawer grouping). */

import { toSession } from "../messages.ts";
import { groupSessions, sessionBucket, type SessionSection } from "../session-groups.ts";
import type { SessionInfo } from "@/types/chat";

describe("session-groups", () => {
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
      // createdAt timestamp is used for the 'at' value for drawer grouping
      expect(session.at).toEqual(new Date("2024-01-15T10:30:00.000Z").getTime());
    });

    it("falls back to updatedAt when createdAt is not present (legacy)", () => {
      const now = Date.now();
      const row: SessionInfo = {
        id: "s-legacy",
        title: "Old Session",
        pinned: false,
        updatedAt: now,
      };

      const session = toSession(row);
      expect(session.id).toEqual("s-legacy");
      // Falls back to updatedAt when createdAt is absent
      expect(session.at).toEqual(now);
    });

    it("handles pinned sessions correctly", () => {
      const row: SessionInfo = {
        id: "s-pinned",
        title: "Pinned Session",
        pinned: true,
        updatedAt: Date.now(),
        createdAt: "2024-01-15T10:30:00.000Z",
      };

      const session = toSession(row);
      expect(session.id).toEqual("s-pinned");
      expect(session.title).toEqual("Pinned Session");
      expect(session.pinned).toBe(true);
    });
  });

  describe("sessionBucket", () => {
    // Use a fixed "now" timestamp for consistent testing
    const NOW = new Date("2024-01-15T12:00:00.000Z").getTime();

    it("categorizes today correctly", () => {
      // Today is Jan 15, 2024 starting at midnight
      const today = new Date("2024-01-15T08:00:00.000Z").getTime();
      expect(sessionBucket(today, NOW)).toBe("today");
    });

    it("categorizes yesterday correctly", () => {
      // Yesterday is Jan 14, 2024
      const yesterday = new Date("2024-01-14T08:00:00.000Z").getTime();
      expect(sessionBucket(yesterday, NOW)).toBe("yesterday");
    });

    it("categorizes this week correctly", () => {
      // Jan 9, 10, 11, 12, 13, 14 are within 6 days ago (this week)
      // Jan 8 is 7 days ago (last week)
      const fiveDaysAgo = new Date("2024-01-10T08:00:00.000Z").getTime();
      expect(sessionBucket(fiveDaysAgo, NOW)).toBe("thisWeek");
    });

    it("categorizes last week correctly", () => {
      // Jan 8 is 7 days ago (last week starts)
      const eightDaysAgo = new Date("2024-01-07T08:00:00.000Z").getTime();
      expect(sessionBucket(eightDaysAgo, NOW)).toBe("lastWeek");
    });

    it("categorizes 2-4 weeks correctly", () => {
      // 28 days ago (within twoToFourWeeks bucket which is 14-34 days)
      const twentyEightDaysAgo = new Date("2024-01-01T08:00:00.000Z").getTime();
      expect(sessionBucket(twentyEightDaysAgo, NOW)).toBe("twoToFourWeeks");
    });

    it("categorizes last month correctly", () => {
      // 45 days ago (within lastMonth bucket which is 35-60 days)
      const fortyFiveDaysAgo = new Date("2023-12-11T12:00:00.000Z").getTime();
      expect(sessionBucket(fortyFiveDaysAgo, NOW)).toBe("lastMonth");
    });

    it("categorizes older correctly", () => {
      // 100 days ago (older bucket is > 60 days)
      const hundredDaysAgo = new Date("2023-10-16T08:00:00.000Z").getTime();
      expect(sessionBucket(hundredDaysAgo, NOW)).toBe("older");
    });
  });

  describe("groupSessions", () => {
    // Use a fixed "now" timestamp for consistent testing
    const NOW = new Date("2024-01-15T12:00:00.000Z").getTime();

    function makeSession(
      id: string,
      title: string,
      options: {
        pinned?: boolean;
        createdAt?: string;
        updatedAt?: number;
      } = {},
    ): SessionInfo {
      return {
        id,
        title,
        pinned: options.pinned ?? false,
        createdAt: options.createdAt,
        updatedAt: options.updatedAt ?? NOW,
      };
    }

    it("groups sessions with pinned first", () => {
      const sessions = [
        // Today (Jan 15)
        makeSession("a", "A", { createdAt: "2024-01-15T10:00:00.000Z", updatedAt: NOW }),
        // Pinned from yesterday (Jan 14)
        makeSession("b", "B", { createdAt: "2024-01-14T10:00:00.000Z", updatedAt: NOW - 86_400_000, pinned: true }),
        // This week (Jan 10)
        makeSession("c", "C", { createdAt: "2024-01-10T10:00:00.000Z", updatedAt: NOW - 21 * 86_400_000 }),
      ];

      const sections = groupSessions(sessions.map(toSession), NOW);

      // First section should be "Pinned"
      expect(sections[0].title).toBe("Pinned");
      expect(sections[0].data.length).toBe(1);
      expect(sections[0].data[0].id).toBe("b");

      // Second section should be "Today"
      expect(sections[1].title).toBe("Today");
    });

    it("sorts sessions newest-first within groups", () => {
      // All pinned, different dates within the buckets
      const sessions = [
        // Oldest pinned (Jan 1)
        makeSession("old", "Old", { createdAt: "2024-01-01T10:00:00.000Z", pinned: true }),
        // Middle pinned (Jan 10)
        makeSession("middle", "Middle", { createdAt: "2024-01-10T10:00:00.000Z", pinned: true }),
        // Newest pinned (Jan 15 - today)
        makeSession("newest", "Newest", { createdAt: "2024-01-15T10:00:00.000Z", pinned: true }),
      ];

      const sections = groupSessions(sessions.map(toSession), NOW);

      // Pinned group should be sorted newest-first
      expect(sections[0].data.map((s) => s.title)).toEqual(["Newest", "Middle", "Old"]);
    });

    it("uses createdAt for grouping when available, falls back to updatedAt", () => {
      // Session with createdAt set 2 days ago (Jan 13)
      const twoDaysAgo = new Date("2024-01-13T10:00:00.000Z").getTime();
      const sessionWithCreatedAt: SessionInfo = {
        id: "with-created",
        title: "With Created",
        pinned: false,
        createdAt: new Date(twoDaysAgo).toISOString(),
        updatedAt: NOW, // Updated now (Jan 15)
      };

      // Session without createdAt (legacy) - updated 2 days ago
      const sessionWithoutCreatedAt: SessionInfo = {
        id: "without-created",
        title: "Without Created",
        pinned: false,
        updatedAt: twoDaysAgo,
      };

      const sessions = [sessionWithCreatedAt, sessionWithoutCreatedAt].map(toSession);
      const sections = groupSessions(sessions, NOW);

      // The session with createdAt should be in "This week" (Jan 13)
      // The session without createdAt should also be in "This week" (updated Jan 13)
      const thisWeekSection = sections.find((s) => s.title === "This week");
      expect(thisWeekSection).toBeDefined();
      expect(thisWeekSection!.data.length).toBe(2);
    });

    it("groups into correct time buckets", () => {
      const sessions: SessionInfo[] = [
        // Today (Jan 15)
        { id: "today", title: "Today", pinned: false, updatedAt: NOW },
        // Yesterday (Jan 14)
        { id: "yesterday", title: "Yesterday", pinned: false, updatedAt: new Date("2024-01-14T08:00:00.000Z").getTime() },
        // This week (Jan 10 - about 5 days ago)
        { id: "week", title: "This Week", pinned: false, updatedAt: new Date("2024-01-10T08:00:00.000Z").getTime() },
        // Last week (Jan 3 - about 12 days ago)
        { id: "lastWeek", title: "Last Week", pinned: false, updatedAt: new Date("2024-01-03T08:00:00.000Z").getTime() },
        // 2-4 weeks ago (Jan 1 - about 15 days ago)
        { id: "twoWeeks", title: "2-4 Weeks", pinned: false, updatedAt: new Date("2024-01-01T08:00:00.000Z").getTime() },
        // Last month (Dec 11 - about 35 days ago)
        { id: "dec25", title: "Dec 25", pinned: false, updatedAt: new Date("2023-12-11T12:00:00.000Z").getTime() },
        // Older (Oct 16 - about 100 days ago)
        { id: "older", title: "Older", pinned: false, updatedAt: new Date("2023-10-16T08:00:00.000Z").getTime() },
      ];

      const sections = groupSessions(sessions.map(toSession), NOW);

      // Check we have the expected section titles
      expect(sections.find((s) => s.title === "Today")).toBeDefined();
      expect(sections.find((s) => s.title === "Yesterday")).toBeDefined();
      expect(sections.find((s) => s.title === "This week")).toBeDefined();
      expect(sections.find((s) => s.title === "Last week")).toBeDefined();
      expect(sections.find((s) => s.title === "2–4 weeks")).toBeDefined();
      expect(sections.find((s) => s.title === "Last month")).toBeDefined();
      expect(sections.find((s) => s.title === "Older")).toBeDefined();
    });

    it("handles empty session list", () => {
      const sections = groupSessions([]);
      expect(sections).toEqual([]);
    });

    it("handles only pinned sessions", () => {
      const sessions = [
        makeSession("p1", "Pinned 1", { pinned: true, createdAt: "2024-01-15T10:00:00.000Z" }),
        makeSession("p2", "Pinned 2", { pinned: true, createdAt: "2024-01-14T10:00:00.000Z" }),
      ];

      const sections = groupSessions(sessions.map(toSession), NOW);

      expect(sections.length).toBe(1);
      expect(sections[0].title).toBe("Pinned");
      expect(sections[0].data.length).toBe(2);
    });

    it("places pinned sessions first in their own group, sorted newest-first within", () => {
      const sessions = [
        // Regular today (8am)
        makeSession("today1", "Today 1", { createdAt: "2024-01-15T08:00:00.000Z" }),
        // Pinned today (11am) - newer
        makeSession("pinned-newer", "Pinned Newer", { createdAt: "2024-01-15T11:00:00.000Z", pinned: true }),
        // Pinned yesterday (10am)
        makeSession("pinned-yesterday", "Pinned Yesterday", { createdAt: "2024-01-14T10:00:00.000Z", pinned: true }),
        // Regular today (10am) - older
        makeSession("today2", "Today 2", { createdAt: "2024-01-15T10:00:00.000Z" }),
      ];

      const sections = groupSessions(sessions.map(toSession), NOW);

      // First section should be Pinned
      expect(sections[0].title).toBe("Pinned");
      expect(sections[0].data.map((s) => s.title)).toEqual(["Pinned Newer", "Pinned Yesterday"]);

      // Second section should be Today (non-pinned), sorted newest-first
      expect(sections[1].title).toBe("Today");
      expect(sections[1].data.map((s) => s.title)).toEqual(["Today 2", "Today 1"]);
    });
  });
});