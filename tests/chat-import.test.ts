/** Session import validation (G10) — the trust boundary.
 *
 * A backup file is user-supplied: truncated, hand-edited, or hostile. These
 * pin what happens to bad input, because that path is otherwise only
 * reachable by handing a broken file to a phone.
 *
 * Run: node --test tests/chat-import.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseImport } from "../lib/chat/import.ts";

function wrap(turns: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: "liai-chat-session",
    version: 1,
    id: "s1",
    title: "Backup",
    pinned: false,
    updatedAt: 1,
    turns,
    ...extra,
  });
}

const ok = { role: "user", content: "hello", at: 1, type: "text" };

describe("accepts what we export", () => {
  it("reads a single-session backup", () => {
    const r = parseImport(wrap([ok, { ...ok, role: "assistant", content: "hi" }]));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.sessions.length, 1);
    assert.equal(r.sessions[0].turns.length, 2);
    assert.equal(r.skipped, 0);
  });

  it("reads an all-sessions backup", () => {
    const text = JSON.stringify({
      format: "liai-chat-sessions",
      version: 1,
      sessions: [
        { title: "One", pinned: true, turns: [ok] },
        { title: "Two", pinned: false, turns: [{ ...ok, content: "b" }] },
      ],
    });
    const r = parseImport(text);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.sessions.length, 2);
    assert.equal(r.sessions[0].pinned, true);
  });
});

describe("refuses what it cannot trust", () => {
  it("rejects non-JSON", () => {
    const r = parseImport("not json at all");
    assert.equal(r.ok, false);
  });

  it("rejects a foreign JSON file", () => {
    const r = parseImport(JSON.stringify({ format: "something-else", version: 1 }));
    assert.equal(r.ok, false);
  });

  it("rejects a future version rather than guessing at it", () => {
    const r = parseImport(wrap([ok], { version: 2 }));
    assert.equal(r.ok, false);
  });

  it("rejects a backup whose sessions list is not an array", () => {
    const r = parseImport(
      JSON.stringify({ format: "liai-chat-sessions", version: 1, sessions: {} }),
    );
    assert.equal(r.ok, false);
  });
});

describe("bounds hostile input", () => {
  it("caps a runaway turn count instead of exhausting memory", () => {
    const turns = Array.from({ length: 5000 }, (_, i) => ({ ...ok, content: `m${i}` }));
    const r = parseImport(wrap(turns));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(
      r.sessions[0].turns.length <= 2000,
      `bounded, got ${r.sessions[0].turns.length}`,
    );
    assert.ok(r.skipped > 0, "the overflow is reported, not hidden");
  });

  it("caps content length", () => {
    const r = parseImport(wrap([{ ...ok, content: "x".repeat(500_000) }]));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.sessions[0].turns[0].content.length <= 100_000);
  });
});

describe("a bad turn is skipped, not fatal", () => {
  // A backup is worth keeping even if one message is malformed; rejecting
  // the whole file would make a single bad row cost the user everything.
  it("keeps the good turns and counts the bad one", () => {
    const r = parseImport(wrap([ok, { role: "narrator", content: "x", at: 1 }, { ...ok }]));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.sessions[0].turns.length, 2);
    assert.equal(r.skipped, 1);
  });

  it("drops a turn with no usable timestamp or role", () => {
    const r = parseImport(wrap([{ role: "user", content: "x" }, ok]));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.sessions[0].turns.length, 1);
  });

  it("refuses a session whose turns are all unusable", () => {
    const r = parseImport(wrap([{ role: "user", content: "x" }]));
    assert.equal(r.ok, false, "an empty conversation is not worth importing");
  });
});

describe("import never trusts an id from the file", () => {
  it("ignores an id smuggled into a turn", () => {
    // The whole reason import mints fresh ids: two imports of the same
    // backup would otherwise collide on row ids and overwrite each other.
    const r = parseImport(wrap([{ ...ok, id: "attacker-chosen-row-id" }]));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const turn = r.sessions[0].turns[0] as unknown as Record<string, unknown>;
    assert.equal(
      turn.id,
      undefined,
      "ids are minted by the store, never taken from the file",
    );
  });

  it("ignores unknown fields rather than carrying them into the store", () => {
    const r = parseImport(wrap([{ ...ok, evil: "payload", usage: { bogus: true } }]));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(
      (r.sessions[0].turns[0] as unknown as Record<string, unknown>).evil,
      undefined,
    );
  });
});

describe("bounded input, reported honestly", () => {
  it("bounds a huge sessions list instead of spreading it into a call", () => {
    // `push(...sessions)` on an untrusted array overflows the stack well
    // before this size, and that RangeError is thrown OUTSIDE the JSON
    // try/catch -- so it escaped parseImport as a crash. It is sliced now.
    const sessions = Array.from({ length: 250 }, (_, i) => ({
      title: `S${i}`,
      pinned: false,
      turns: [ok],
    }));
    const r = parseImport(
      JSON.stringify({ format: "liai-chat-sessions", version: 1, sessions }),
    );
    assert.equal(r.ok, true, "refused cleanly, not crashed");
    if (!r.ok) return;
    assert.equal(r.sessions.length, 200);
    assert.equal(r.skipped, 50, "the overflow is reported, not hidden");
  });

  it("counts a turn whose reasoning/usage/steps it will not restore", () => {
    // Silently discarding them while reporting skipped: 0 is the same
    // class of mistake the module exists to prevent -- a restore that
    // quietly loses data and claims it kept everything.
    const r = parseImport(
      wrap([
        ok,
        { ...ok, content: "rich", steps: [{ tool: "web_search" }], usage: { totalTokens: 5 } },
      ]),
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.sessions[0].turns.length, 2, "both turns are still restored");
    assert.equal(r.skipped, 1, "and the lossy one is counted");
  });
});

describe("titles", () => {
  it("substitutes a name when the title is blank", () => {
    const r = parseImport(wrap([ok], { title: "   " }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.notEqual(r.sessions[0].title.trim(), "", "an unnamed row is unreadable");
  });
});