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

/** The same store plus the raw TinyBase handle, for writing cells the
 *  public API would never produce (a half-written or corrupt row). */
function newStoreRaw(): { store: TinyBaseSessionStore; tiny: ReturnType<typeof createStore> } {
  const tiny = createStore();
  return { store: new TinyBaseSessionStore(tiny), tiny };
}

it("keeps a boolean sampler override (include-thinking-in-context)", async () => {
const store = newStore();
const id = await store.create();
await store.setSessionSampler(id, { includeThinkingInContext: false });
assert.deepEqual(await store.getSessionSampler(id), {
includeThinkingInContext: false,
});
});

it("round-trips reasoning on an assistant turn", async () => {
const store = newStore();
const id = await store.create();
await store.append(id, {
role: "assistant",
content: "done",
reasoning: "user asked why",
});
const turns = await store.get(id);
assert.equal(turns?.[0]?.reasoning, "user asked why");
});

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

describe("truncateFrom", () => {
  it("drops the turn at the index and everything after it", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q1" });
    await store.append(id, { role: "assistant", content: "a1" });
    await store.append(id, { role: "user", content: "q2" });
    await store.append(id, { role: "assistant", content: "a2" });
    assert.equal(await store.truncateFrom(id, 1), true);
    assert.deepEqual(
      (await store.get(id))?.map((t) => t.content),
      ["q1"],
    );
  });

  it("keeps the turns before the index untouched", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "keep 1" });
    await store.append(id, { role: "assistant", content: "keep 2" });
    await store.append(id, { role: "user", content: "drop" });
    await store.truncateFrom(id, 2);
    assert.deepEqual(
      (await store.get(id))?.map((t) => t.content),
      ["keep 1", "keep 2"],
    );
  });

  it("drops the tool calls of every turn it removed", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    await store.append(id, {
      role: "assistant",
      content: "with steps",
      steps: [{ id: "s1", tool: "web_search", position: 0 }],
    });
    await store.append(id, {
      role: "assistant",
      content: "more steps",
      steps: [{ id: "s2", tool: "read_url", position: 0 }],
    });
    await store.truncateFrom(id, 1);
    const left = await store.get(id);
    assert.equal(left?.length, 1);
    // The surviving turn must not have inherited a removed turn's tool
    // calls — that is what the deleteStepsOf cascade is there to stop.
    assert.equal(left?.[0].steps, undefined);
  });

  it("can drop the whole conversation", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    assert.equal(await store.truncateFrom(id, 0), true);
    assert.deepEqual(await store.get(id), []);
  });

  it("refuses an out-of-range index and drops nothing", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    await store.append(id, { role: "assistant", content: "a" });
    assert.equal(await store.truncateFrom(id, 2), false);
    assert.equal(await store.truncateFrom(id, -1), false);
    assert.equal(await store.truncateFrom(id, 1.5), false);
    assert.deepEqual(
      (await store.get(id))?.map((t) => t.content),
      ["q", "a"],
    );
  });

  it("refuses on a missing session and on an empty one", async () => {
    const store = newStore();
    const id = await store.create();
    assert.equal(await store.truncateFrom("ghost", 0), false);
    assert.equal(await store.truncateFrom(id, 0), false);
  });

  it("leaves other sessions alone", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    await store.append(a, { role: "user", content: "a1" });
    await store.append(b, { role: "user", content: "b1" });
    await store.truncateFrom(a, 0);
    assert.deepEqual(
      (await store.get(b))?.map((t) => t.content),
      ["b1"],
    );
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

describe("session sampler", () => {
  it("has no override until one is set", async () => {
    const store = newStore();
    const id = await store.create();
    assert.equal(await store.getSessionSampler(id), null);
  });

  it("stores only the fields a session overrides", async () => {
    // Partial on purpose: a field the session never touched must keep
    // following the global preset, so a new global default still lands.
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, { temperature: 0.2 });
    assert.deepEqual(await store.getSessionSampler(id), { temperature: 0.2 });
  });

  it("keeps each session's override its own", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    await store.setSessionSampler(a, { temperature: 0.2 });
    assert.equal(await store.getSessionSampler(b), null);
    await store.setSessionSampler(b, { topP: 0.5, temperature: 0.9 });
    assert.deepEqual(await store.getSessionSampler(a), { temperature: 0.2 });
  });

  it("restores the global preset when cleared with null", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, { temperature: 0.2 });
    await store.setSessionSampler(id, null);
    assert.equal(await store.getSessionSampler(id), null);
  });

  it("treats an empty override as no override", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, {});
    assert.equal(await store.getSessionSampler(id), null, "no row is kept for nothing");
  });

  it("drops the override when the session is deleted", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, { temperature: 0.2 });
    await store.deleteSession(id);
    assert.equal(await store.getSessionSampler(id), null);
  });

  it("returns no override for a corrupt one rather than throwing", async () => {
    const { store, tiny } = newStoreRaw();
    const id = await store.create();
    tiny.setRow("sessionSampler", id, { values: "not json" });
    assert.equal(await store.getSessionSampler(id), null);
  });

  it("ignores a stored field that is not a finite number", async () => {
    const { store, tiny } = newStoreRaw();
    const id = await store.create();
    tiny.setRow("sessionSampler", id, {
      values: JSON.stringify({ temperature: "hot", topP: 0.5 }),
    });
    assert.deepEqual(await store.getSessionSampler(id), { topP: 0.5 });
  });
});

describe("duplicating a session", () => {
  async function seeded() {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "how do I fix a wobbly shelf?" });
    await store.append(id, {
      role: "assistant",
      content: "Check the wall anchors.",
      steps: [
        { id: "s1", tool: "web_search", position: 1 },
        { id: "s0", tool: "read_page", position: 0, result: "a guide" },
      ],
    });
    await store.setTitleIfEmpty(id, "Wobbly shelf");
    return { store, id };
  }

  it("copies every turn, in order", async () => {
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);
    assert.notEqual(copyId, id);
    const copied = await store.get(copyId);
    assert.deepEqual(
      copied?.map((t) => t.content),
      ["how do I fix a wobbly shelf?", "Check the wall anchors."],
    );
  });

  it("copies the tool calls, still in call order", async () => {
    // A fork that loses its tool results is not a fork of the conversation.
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);
    const turns = await store.get(copyId);
    assert.deepEqual(
      turns?.[1].steps?.map((s) => s.tool),
      ["read_page", "web_search"],
    );
  });

  it("leaves the original's tool calls intact", async () => {
    // REGRESSION: toolRuns is keyed by step id, so re-appending the
    // source's ids made every copy step overwrite the SOURCE's row with
    // the copy's messageId. The fork looked perfect and the original
    // silently lost every tool call.
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);

    const original = await store.get(id);
    assert.deepEqual(
      original?.[1].steps?.map((s) => s.tool),
      ["read_page", "web_search"],
      "the source must keep its tool calls after being forked",
    );
    assert.equal(
      original?.[1].steps?.find((s) => s.tool === "read_page")?.result,
      "a guide",
      "the source must keep its tool result too",
    );

    // And the two conversations must not share step rows.
    const copied = await store.get(copyId);
    assert.equal(copied?.[1].steps?.find((s) => s.tool === "read_page")?.result, "a guide");
    for (const step of copied?.[1].steps ?? []) {
      assert.ok(
        !(original?.[1].steps ?? []).some((s) => s.id === step.id),
        "copy and original must not share a step id",
      );
    }
  });

  it("carries the session's sampler override", async () => {
    // The override is per conversation, so a fork that dropped it would
    // silently revert to the preset — only noticed after trusting the fork.
    const { store, id } = await seeded();
    await store.setSessionSampler(id, { temperature: 0.2, topP: 0.5 });
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);
    assert.deepEqual(await store.getSessionSampler(copyId), {
      temperature: 0.2,
      topP: 0.5,
    });
  });

  it("leaves no override on the copy when the source had none", async () => {
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);
    assert.equal(await store.getSessionSampler(copyId), null);
  });

  it("titles the copy and makes it the active conversation", async () => {
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);
    const sessions = await store.listSessions();
    const copy = sessions.find((s) => s.id === copyId);
    assert.equal(copy?.title, "Wobbly shelf - Copy");
    assert.equal(await store.getActiveSessionId(), copyId);
  });

  it("never copies the pin", async () => {
    // A pinned row sits at the top of the drawer; a fork should not
    // silently occupy two of the top slots.
    const { store, id } = await seeded();
    await store.setSessionPinned(id, true);
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);
    const sessions = await store.listSessions();
    assert.equal(sessions.find((s) => s.id === copyId)?.pinned, false);
  });

  it("leaves the original exactly as it was", async () => {
    const { store, id } = await seeded();
    await store.setSessionPinned(id, true);
    const copyId = await store.duplicateSession(id);
    assert.ok(copyId);
    const sessions = await store.listSessions();
    const original = sessions.find((s) => s.id === id);
    assert.equal(original?.title, "Wobbly shelf");
    assert.equal(original?.pinned, true);
    assert.equal((await store.get(id))?.length, 2);
  });

  it("refuses a session that does not exist", async () => {
    const store = newStore();
    assert.equal(await store.duplicateSession("ghost"), null);
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
