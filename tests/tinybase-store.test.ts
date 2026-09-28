/** TinyBase session store: the real implementation, in memory.
 *
 * This is the agreed seam (ADR-0012): the app talks to the `SessionStore`
 * port, and this suite drives the REAL TinyBase-backed implementation
 * against a bare `createStore()` — no persister, no expo-sqlite, so it
 * runs under `node --test`. The persister wiring is device-verified
 * instead (lib/tinybase.ts); everything below it is verified here.
 *
 * Run: node --test tests/tinybase-store.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "tinybase";

import { TinyBaseSessionStore } from "../lib/chat/tinybase-store.ts";

function newStore(): TinyBaseSessionStore {
  return new TinyBaseSessionStore(createStore());
}

describe("tool calls", () => {
  it("round-trips steps in call order and rounds the usage up", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "done",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      steps: [
        { id: "s0", tool: "search", position: 0, input: { q: "cats" }, result: "pics" },
        { id: "s1", tool: "fetch", position: 1 },
      ],
    });
    assert.deepEqual(await store.get(id), [
      {
        role: "assistant",
        content: "done",
        type: "text",
        at: (await store.get(id))?.[0].at,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        steps: [
          { id: "s0", tool: "search", position: 0, input: { q: "cats" }, result: "pics" },
          { id: "s1", tool: "fetch", position: 1 },
        ],
      },
    ]);
  });

  it("orders by position, not by insertion", async () => {
    // The child table is an unordered map, so `position` is the only
    // thing restoring call order. Written reversed on purpose.
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "x",
      steps: [
        { id: "s2", tool: "third", position: 2 },
        { id: "s0", tool: "first", position: 0 },
        { id: "s1", tool: "second", position: 1 },
      ],
    });
    assert.deepEqual(
      (await store.get(id))?.[0].steps?.map((s) => s.tool),
      ["first", "second", "third"],
    );
  });

  it("keeps one turn's steps off another turn", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "first",
      steps: [{ id: "a", tool: "only-on-first", position: 0 }],
    });
    await store.append(id, { role: "assistant", content: "second" });
    const turns = await store.get(id);
    assert.deepEqual(turns?.[0].steps?.map((s) => s.tool), ["only-on-first"]);
    assert.equal(turns?.[1].steps, undefined);
  });

  it("omits steps and usage entirely when a turn has neither", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "plain" });
    const turn = (await store.get(id))?.[0];
    assert.equal("steps" in (turn ?? {}), false);
    assert.equal("usage" in (turn ?? {}), false);
  });
});

describe("session list", () => {
  it("lists pinned sessions first, then the most recently touched", async () => {
    // Sorted by a monotonic counter, not the clock: two sessions touched
    // in the same millisecond would otherwise order arbitrarily.
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    const pinned = await store.create();
    await store.setSessionPinned(pinned, true);
    await store.append(a, { role: "user", content: "a" });
    await store.append(b, { role: "user", content: "b" });
    await store.append(a, { role: "user", content: "a again" });
    assert.deepEqual(
      (await store.listSessions()).map((s) => s.id),
      [pinned, a, b],
    );
  });

  it("keeps list order stable across same-millisecond updates", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    for (let i = 0; i < 5; i += 1) {
      await store.append(a, { role: "user", content: `a${i}` });
      await store.append(b, { role: "user", content: `b${i}` });
    }
    assert.deepEqual(
      (await store.listSessions()).map((s) => s.id),
      [b, a],
    );
  });

  it("starts a new session untitled and unpinned", async () => {
    const store = newStore();
    const id = await store.create();
    const [session] = await store.listSessions();
    assert.equal(session.id, id);
    assert.equal(session.title, "");
    assert.equal(session.pinned, false);
    assert.equal(typeof session.updatedAt, "number");
  });

  it("renames and pins, and reports false for a session that is not there", async () => {
    const store = newStore();
    const id = await store.create();
    assert.equal(await store.renameSession(id, "Cats"), true);
    assert.equal(await store.setSessionPinned(id, true), true);
    assert.deepEqual(
      { ...(await store.listSessions())[0], updatedAt: 0 },
      { id, title: "Cats", pinned: true, updatedAt: 0 },
    );
    assert.equal(await store.renameSession("ghost", "Nope"), false);
    assert.equal(await store.setSessionPinned("ghost", true), false);
  });

  it("sets a title only while it is still empty", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setTitleIfEmpty(id, "First");
    await store.setTitleIfEmpty(id, "Second");
    assert.equal((await store.listSessions())[0].title, "First");
  });

  it("does not mint a session that does not exist", async () => {
    // A session row always exists before a title is set (append creates
    // it), so setting a title must never conjure a phantom conversation.
    const store = newStore();
    await store.setTitleIfEmpty("fresh", "Hello");
    assert.deepEqual(await store.listSessions(), []);
  });

  it("deletes the session, its turns and their tool calls", async () => {
    const store = newStore();
    const id = await store.create();
    const other = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "bye",
      steps: [{ id: "s", tool: "search", position: 0 }],
    });
    await store.append(other, { role: "user", content: "keep me" });
    assert.equal(await store.deleteSession(id), true);
    assert.deepEqual((await store.listSessions()).map((s) => s.id), [other]);
    assert.equal(await store.get(id), null);
    assert.equal((await store.get(other))?.length, 1);
  });

  it("reports false when deleting a session that is not there", async () => {
    assert.equal(await newStore().deleteSession("ghost"), false);
  });
});

describe("popLastAssistant", () => {
  it("drops the trailing assistant turn and keeps the rest", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    await store.append(id, { role: "assistant", content: "a1" });
    await store.append(id, { role: "assistant", content: "a2" });
    assert.equal(await store.popLastAssistant(id), true);
    assert.deepEqual(
      (await store.get(id))?.map((t) => t.content),
      ["q", "a1"],
    );
  });

  it("drops the tool calls that belonged to the dropped turn", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "with steps",
      steps: [{ id: "s", tool: "search", position: 0 }],
    });
    await store.popLastAssistant(id);
    await store.append(id, { role: "assistant", content: "regenerated" });
    assert.equal((await store.get(id))?.[0].steps, undefined);
  });

  it("refuses when the last turn is the user's", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    assert.equal(await store.popLastAssistant(id), false);
  });

  it("refuses on an empty session and on a missing one", async () => {
    const store = newStore();
    const id = await store.create();
    assert.equal(await store.popLastAssistant(id), false);
    assert.equal(await store.popLastAssistant("ghost"), false);
  });
});

describe("drafts", () => {
  const NEW = null;

  it("keeps one draft per session", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    await store.setDraft(a, "draft a");
    await store.setDraft(b, "draft b");
    assert.equal(await store.getDraft(a), "draft a");
    assert.equal(await store.getDraft(b), "draft b");
  });

  it("parks an unsent conversation under its own slot", async () => {
    const store = newStore();
    await store.setDraft(NEW, "not sent yet");
    assert.equal(await store.getDraft(NEW), "not sent yet");
    const id = await store.create();
    await store.setDraft(id, "sent already");
    assert.equal(await store.getDraft(NEW), "not sent yet");
  });

  it("reads back an empty string when no draft exists", async () => {
    const store = newStore();
    const id = await store.create();
    assert.equal(await store.getDraft(id), "");
    assert.equal(await store.getDraft(NEW), "");
  });

  it("stores no row for an empty draft", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setDraft(id, "something");
    await store.setDraft(id, "");
    assert.equal(await store.getDraft(id), "");
  });

  it("clears a draft explicitly", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setDraft(id, "bye");
    await store.clearDraft(id);
    assert.equal(await store.getDraft(id), "");
  });
});

describe("active session", () => {
  it("round-trips the active session id", async () => {
    const store = newStore();
    const id = await store.create();
    assert.equal(await store.getActiveSessionId(), null);
    await store.setActiveSessionId(id);
    assert.equal(await store.getActiveSessionId(), id);
  });

  it("clears the active session id", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setActiveSessionId(id);
    await store.setActiveSessionId(null);
    assert.equal(await store.getActiveSessionId(), null);
  });

  it("drops the active pointer and the draft when a session is deleted", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setActiveSessionId(id);
    await store.setDraft(id, "unfinished thought");
    await store.deleteSession(id);
    assert.equal(await store.getActiveSessionId(), null);
    assert.equal(await store.getDraft(id), "");
  });
});

describe("sessions", () => {
  it("creates a session and reads it back as an empty conversation", async () => {
    const store = newStore();
    const id = await store.create();
    assert.equal(typeof id, "string");
    assert.deepEqual(await store.get(id), []);
  });

  it("returns null for a session that does not exist", async () => {
    assert.equal(await newStore().get("nope"), null);
  });

  it("round-trips a user turn and an assistant turn in order", async () => {
    const store = newStore();
    const id = await store.create();
    const at = Date.now();
    await store.append(id, { role: "user", content: "hi", at });
    await store.append(id, { role: "assistant", content: "hello", at });
    assert.deepEqual(await store.get(id), [
      { role: "user", content: "hi", type: "text", at },
      { role: "assistant", content: "hello", type: "text", at },
    ]);
  });

  it("keeps call order for turns that share a timestamp", async () => {
    // Two appends can land in the same millisecond (a turn writes the
    // user message and the assistant stub back to back), so the ordering
    // key is the insertion sequence, not the clock.
    const store = newStore();
    const id = await store.create();
    const at = Date.now();
    for (const content of ["one", "two", "three"]) {
      await store.append(id, { role: "user", content, at });
    }
    assert.deepEqual(
      (await store.get(id))?.map((t) => t.content),
      ["one", "two", "three"],
    );
  });

  it("defaults the type and stamps a missing timestamp", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "hi" });
    const turn = (await store.get(id))?.[0];
    assert.equal(turn?.type, "text");
    assert.equal(typeof turn?.at, "number");
  });

  it("keeps sessions isolated from one another", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    await store.append(a, { role: "user", content: "only a" });
    assert.deepEqual(await store.get(b), []);
  });
});
