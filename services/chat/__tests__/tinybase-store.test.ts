
/** TinyBase session store: the real implementation, in memory.
 *
 * This is the agreed seam (ADR-0012): the app talks to the `SessionStore`
 * port, and this suite drives the REAL TinyBase-backed implementation
 * against a bare `createStore()` - no persister, no expo-sqlite. The
 * persister wiring is device-verified instead (services/chat/tinybase.ts); everything
 * below it is verified here.
 */

import { readSource } from "../../../jest/source";
import { createStore } from "tinybase";

import { TinyBaseSessionStore } from "../tinybase-store";

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
expect(await store.getSessionSampler(id)).toEqual({
includeThinkingInContext: false,
});
});

describe("turn outcome flags", () => {
it("round-trips contextFull and timings", async () => {
    // The G1 banner and G4 footer read these off a RELOADED turn, so the
    // round-trip is the feature: flags that only live in memory would make
    // both surfaces vanish the moment the app restarts.
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "cut off",
      outcome: {
        contextFull: true,
        timings: { promptMs: 120, tokensPerSecond: 25, msPerToken: 40 },
      },
    });
    expect((await store.get(id))?.[0].outcome).toEqual({
      contextFull: true,
      timings: { promptMs: 120, tokensPerSecond: 25, msPerToken: 40 },
    });
  });

  it("round-trips interrupted on its own", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "partial",
      outcome: { interrupted: true },
    });
    expect((await store.get(id))?.[0].outcome).toEqual({ interrupted: true });
  });

  it("omits outcome entirely when the engine reported nothing", async () => {
    // No empty object left behind: an unflagged turn must not look like
    // one that reported "nothing happened".
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "assistant", content: "fine" });
    expect("outcome" in ((await store.get(id))?.[0] ?? {})).toEqual(false);
  });

  it("drops flags that were false, rather than storing them", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "x",
      outcome: { contextFull: false, interrupted: false },
    });
    expect((await store.get(id))?.[0].outcome).toEqual(undefined);
  });

  it("round-trips prompt throughput, and an old row reads as none", async () => {
    // The timings live in FLAT columns, so a new field only survives a
    // restart if every projection names it. A row written before the
    // field existed must read as "not reported" rather than 0.
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "hi",
      outcome: {
        timings: {
          promptMs: 120,
          tokensPerSecond: 25,
          msPerToken: 40,
          promptTokensPerSecond: 640.5,
        },
      },
    });
    expect((await store.get(id))?.[0].outcome?.timings).toEqual({
      promptMs: 120,
      tokensPerSecond: 25,
      msPerToken: 40,
      promptTokensPerSecond: 640.5,
    });
    await store.append(id, {
      role: "assistant",
      content: "older",
      outcome: { timings: { promptMs: 120, tokensPerSecond: 25, msPerToken: 40 } },
    });
    const older = (await store.get(id))?.[1].outcome?.timings;
    expect(older?.promptTokensPerSecond).toEqual(undefined);
    expect("promptTokensPerSecond" in (older ?? {})).toEqual(false);
  });

  it("keeps timings even when every figure is zero", async () => {
    // A very fast turn legitimately measures 0; dropping it would hide
    // that we DID measure.
    const store = newStore();
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "x",
      outcome: { timings: { promptMs: 0, tokensPerSecond: 0, msPerToken: 0 } },
    });
    expect((await store.get(id))?.[0].outcome?.timings).toEqual({
      promptMs: 0,
      tokensPerSecond: 0,
      msPerToken: 0,
    });
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
expect(turns?.[0]?.reasoning).toEqual("user asked why");
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
    const read = await store.get(id);
    // `id` is the row id and carries a timestamp, so it is compared by
    // shape rather than by literal. Everything else must round-trip whole.
    expect(read?.length).toEqual(1);
    const { id: rowId2, ...turn } = read![0];
    expect(typeof rowId2).toEqual("string");
    expect(turn).toEqual({
      role: "assistant",
      content: "done",
      type: "text",
      at: read?.[0].at,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      steps: [
        { id: "s0", tool: "search", position: 0, input: { q: "cats" }, result: "pics" },
        { id: "s1", tool: "fetch", position: 1 },
      ],
    });
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
    expect((await store.get(id))?.[0].steps?.map((s) => s.tool)).toEqual(["first", "second", "third"]);
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
    expect(turns?.[0].steps?.map((s) => s.tool)).toEqual(["only-on-first"]);
    expect(turns?.[1].steps).toEqual(undefined);
  });

  it("omits steps and usage entirely when a turn has neither", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "plain" });
    const turn = (await store.get(id))?.[0];
    expect("steps" in (turn ?? {})).toEqual(false);
    expect("usage" in (turn ?? {})).toEqual(false);
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
    expect((await store.listSessions()).map((s) => s.id)).toEqual([pinned, a, b]);
  });

  it("keeps list order stable across same-millisecond updates", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    for (let i = 0; i < 5; i += 1) {
      await store.append(a, { role: "user", content: `a${i}` });
      await store.append(b, { role: "user", content: `b${i}` });
    }
    expect((await store.listSessions()).map((s) => s.id)).toEqual([b, a]);
  });

  it("starts a new session untitled and unpinned", async () => {
    const store = newStore();
    const id = await store.create();
    const [session] = await store.listSessions();
    expect(session.id).toEqual(id);
    expect(session.title).toEqual("");
    expect(session.pinned).toEqual(false);
    expect(typeof session.updatedAt).toEqual("number");
  });

  it("renames and pins, and reports false for a session that is not there", async () => {
    const store = newStore();
    const id = await store.create();
    expect(await store.renameSession(id, "Cats")).toEqual(true);
    expect(await store.setSessionPinned(id, true)).toEqual(true);
    expect({ ...(await store.listSessions())[0], updatedAt: 0 }).toEqual({ id, title: "Cats", pinned: true, updatedAt: 0 });
    expect(await store.renameSession("ghost", "Nope")).toEqual(false);
    expect(await store.setSessionPinned("ghost", true)).toEqual(false);
  });

  it("sets a title only while it is still empty", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setTitleIfEmpty(id, "First");
    await store.setTitleIfEmpty(id, "Second");
    expect((await store.listSessions())[0].title).toEqual("First");
  });

  it("does not mint a session that does not exist", async () => {
    // A session row always exists before a title is set (append creates
    // it), so setting a title must never conjure a phantom conversation.
    const store = newStore();
    await store.setTitleIfEmpty("fresh", "Hello");
    expect(await store.listSessions()).toEqual([]);
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
    expect(await store.deleteSession(id)).toEqual(true);
    expect((await store.listSessions()).map((s) => s.id)).toEqual([other]);
    expect(await store.get(id)).toEqual(null);
    expect((await store.get(other))?.length).toEqual(1);
  });

  it("reports false when deleting a session that is not there", async () => {
    expect(await newStore().deleteSession("ghost")).toEqual(false);
  });
});

describe("popLastAssistant", () => {
  it("drops the trailing assistant turn and keeps the rest", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    await store.append(id, { role: "assistant", content: "a1" });
    await store.append(id, { role: "assistant", content: "a2" });
    expect(await store.popLastAssistant(id)).toEqual(true);
    expect((await store.get(id))?.map((t) => t.content)).toEqual(["q", "a1"]);
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
    expect((await store.get(id))?.[0].steps).toEqual(undefined);
  });

  it("refuses when the last turn is the user's", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    expect(await store.popLastAssistant(id)).toEqual(false);
  });

  it("refuses on an empty session and on a missing one", async () => {
    const store = newStore();
    const id = await store.create();
    expect(await store.popLastAssistant(id)).toEqual(false);
    expect(await store.popLastAssistant("ghost")).toEqual(false);
  });
});

describe("truncateFrom", () => {
  /** Row ids embed a timestamp, so a test cannot predict one: read the
   *  id back off `get()`, which is exactly how a caller gets it. */
  const idsOf = async (store: TinyBaseSessionStore, sessionId: string) =>
    (await store.get(sessionId))!.map((t) => t.id);

  it("drops the named turn and everything after it", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q1" });
    await store.append(id, { role: "assistant", content: "a1" });
    await store.append(id, { role: "user", content: "q2" });
    await store.append(id, { role: "assistant", content: "a2" });
    const ids = await idsOf(store, id);
    expect(await store.truncateFrom(id, ids[1])).toEqual(true);
    expect((await store.get(id))?.map((t) => t.content)).toEqual(["q1"]);
  });

  it("keeps the turns before the named one untouched", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "keep 1" });
    await store.append(id, { role: "assistant", content: "keep 2" });
    await store.append(id, { role: "user", content: "drop" });
    const ids = await idsOf(store, id);
    expect(await store.truncateFrom(id, ids[2])).toEqual(true);
    expect((await store.get(id))?.map((t) => t.content)).toEqual(["keep 1", "keep 2"]);
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
    const ids = await idsOf(store, id);
    expect(await store.truncateFrom(id, ids[1])).toEqual(true);
    const left = await store.get(id);
    expect(left?.length).toEqual(1);
    // The surviving turn must not have inherited a removed turn's tool
    // calls — that is what the deleteStepsOf cascade is there to stop.
    expect(left?.[0].steps).toEqual(undefined);
  });

  it("can drop the whole conversation", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    const ids = await idsOf(store, id);
    expect(await store.truncateFrom(id, ids[0])).toEqual(true);
    expect(await store.get(id)).toEqual([]);
  });

  it("refuses an unknown id and drops nothing", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" });
    await store.append(id, { role: "assistant", content: "a" });
    expect(await store.truncateFrom(id, "not-a-real-id")).toEqual(false);
    expect(await store.truncateFrom(id, "")).toEqual(false);
    expect((await store.get(id))?.map((t) => t.content)).toEqual(["q", "a"]);
  });

  it("refuses on a missing session and on an empty one", async () => {
    const store = newStore();
    const id = await store.create();
    expect(await store.truncateFrom("ghost", "whatever")).toEqual(false);
    expect(await store.truncateFrom(id, "whatever")).toEqual(false);
  });

  it("leaves other sessions alone", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    await store.append(a, { role: "user", content: "a1" });
    await store.append(b, { role: "user", content: "b1" });
    const ids = await idsOf(store, a);
    expect(await store.truncateFrom(a, ids[0])).toEqual(true);
    expect((await store.get(b))?.map((t) => t.content)).toEqual(["b1"]);
  });

  it("truncates by the id it was given, not by position", async () => {
    // The reason ids exist: a caller that holds an id from `get()` must
    // not be able to mean the wrong turn. Append a second turn AFTER
    // reading the ids, so a position-based implementation would shift.
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "first" });
    await store.append(id, { role: "assistant", content: "reply" });
    const targetId = (await idsOf(store, id))[0];
    await store.append(id, { role: "user", content: "later" });
    expect(await store.truncateFrom(id, targetId)).toEqual(true);
    expect(await store.get(id)).toEqual([]);
  });

  it("honours an id pinned at append time", async () => {
    // The one-identity contract: a bubble's id IS its row id, so an id
    // supplied by the caller is the one `get()` hands back.
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q" }, "pinned-row-id");
    expect(await idsOf(store, id)).toEqual(["pinned-row-id"]);
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
    expect(await store.getDraft(a)).toEqual("draft a");
    expect(await store.getDraft(b)).toEqual("draft b");
  });

  it("parks an unsent conversation under its own slot", async () => {
    const store = newStore();
    await store.setDraft(NEW, "not sent yet");
    expect(await store.getDraft(NEW)).toEqual("not sent yet");
    const id = await store.create();
    await store.setDraft(id, "sent already");
    expect(await store.getDraft(NEW)).toEqual("not sent yet");
  });

  it("reads back an empty string when no draft exists", async () => {
    const store = newStore();
    const id = await store.create();
    expect(await store.getDraft(id)).toEqual("");
    expect(await store.getDraft(NEW)).toEqual("");
  });

  it("stores no row for an empty draft", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setDraft(id, "something");
    await store.setDraft(id, "");
    expect(await store.getDraft(id)).toEqual("");
  });

  it("clears a draft explicitly", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setDraft(id, "bye");
    await store.clearDraft(id);
    expect(await store.getDraft(id)).toEqual("");
  });
});

describe("session sampler", () => {
  it("has no override until one is set", async () => {
    const store = newStore();
    const id = await store.create();
    expect(await store.getSessionSampler(id)).toEqual(null);
  });

  it("stores only the fields a session overrides", async () => {
    // Partial on purpose: a field the session never touched must keep
    // following the global preset, so a new global default still lands.
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, { temperature: 0.2 });
    expect(await store.getSessionSampler(id)).toEqual({ temperature: 0.2 });
  });

  it("keeps each session's override its own", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    await store.setSessionSampler(a, { temperature: 0.2 });
    expect(await store.getSessionSampler(b)).toEqual(null);
    await store.setSessionSampler(b, { topP: 0.5, temperature: 0.9 });
    expect(await store.getSessionSampler(a)).toEqual({ temperature: 0.2 });
  });

  it("restores the global preset when cleared with null", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, { temperature: 0.2 });
    await store.setSessionSampler(id, null);
    expect(await store.getSessionSampler(id)).toEqual(null);
  });

  it("treats an empty override as no override", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, {});
    expect(await store.getSessionSampler(id)).toEqual(null);
  });

  it("drops the override when the session is deleted", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setSessionSampler(id, { temperature: 0.2 });
    await store.deleteSession(id);
    expect(await store.getSessionSampler(id)).toEqual(null);
  });

  it("returns no override for a corrupt one rather than throwing", async () => {
    const { store, tiny } = newStoreRaw();
    const id = await store.create();
    tiny.setRow("sessionSampler", id, { values: "not json" });
    expect(await store.getSessionSampler(id)).toEqual(null);
  });

  it("ignores a stored field that is not a finite number", async () => {
    const { store, tiny } = newStoreRaw();
    const id = await store.create();
    tiny.setRow("sessionSampler", id, {
      values: JSON.stringify({ temperature: "hot", topP: 0.5 }),
    });
    expect(await store.getSessionSampler(id)).toEqual({ topP: 0.5 });
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
    expect(copyId).toBeTruthy();
    expect(copyId).not.toEqual(id);
    const copied = await store.get(copyId as string);
    expect(copied?.map((t) => t.content)).toEqual(["how do I fix a wobbly shelf?", "Check the wall anchors."]);
  });

  it("copies the tool calls, still in call order", async () => {
    // A fork that loses its tool results is not a fork of the conversation.
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    expect(copyId).toBeTruthy();
    const turns = await store.get(copyId as string);
    expect(turns?.[1].steps?.map((s) => s.tool)).toEqual(["read_page", "web_search"]);
  });

  it("leaves the original's tool calls intact", async () => {
    // REGRESSION: toolRuns is keyed by step id, so re-appending the
    // source's ids made every copy step overwrite the SOURCE's row with
    // the copy's messageId. The fork looked perfect and the original
    // silently lost every tool call.
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    expect(copyId).toBeTruthy();

    const original = await store.get(id);
    expect(original?.[1].steps?.map((s) => s.tool)).toEqual(["read_page", "web_search"]);
    expect(original?.[1].steps?.find((s) => s.tool === "read_page")?.result).toEqual("a guide");

    // And the two conversations must not share step rows.
    const copied = await store.get(copyId as string);
    expect(copied?.[1].steps?.find((s) => s.tool === "read_page")?.result).toEqual("a guide");
    for (const step of copied?.[1].steps ?? []) {
      expect(!(original?.[1].steps ?? []).some((s) => s.id === step.id)).toBeTruthy();
    }
  });

  it("carries the session's sampler override", async () => {
    // The override is per conversation, so a fork that dropped it would
    // silently revert to the preset — only noticed after trusting the fork.
    const { store, id } = await seeded();
    await store.setSessionSampler(id, { temperature: 0.2, topP: 0.5 });
    const copyId = await store.duplicateSession(id);
    expect(copyId).toBeTruthy();
    expect(await store.getSessionSampler(copyId as string)).toEqual({
      temperature: 0.2,
      topP: 0.5,
    });
  });

  it("leaves no override on the copy when the source had none", async () => {
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    expect(copyId).toBeTruthy();
    expect(await store.getSessionSampler(copyId as string)).toEqual(null);
  });

  it("titles the copy and makes it the active conversation", async () => {
    const { store, id } = await seeded();
    const copyId = await store.duplicateSession(id);
    expect(copyId).toBeTruthy();
    const sessions = await store.listSessions();
    const copy = sessions.find((s) => s.id === copyId);
    expect(copy?.title).toEqual("Wobbly shelf - Copy");
    expect(await store.getActiveSessionId()).toEqual(copyId);
  });

  it("never copies the pin", async () => {
    // A pinned row sits at the top of the drawer; a fork should not
    // silently occupy two of the top slots.
    const { store, id } = await seeded();
    await store.setSessionPinned(id, true);
    const copyId = await store.duplicateSession(id);
    expect(copyId).toBeTruthy();
    const sessions = await store.listSessions();
    expect(sessions.find((s) => s.id === copyId)?.pinned).toEqual(false);
  });

  it("leaves the original exactly as it was", async () => {
    const { store, id } = await seeded();
    await store.setSessionPinned(id, true);
    const copyId = await store.duplicateSession(id);
    expect(copyId).toBeTruthy();
    const sessions = await store.listSessions();
    const original = sessions.find((s) => s.id === id);
    expect(original?.title).toEqual("Wobbly shelf");
    expect(original?.pinned).toEqual(true);
    expect((await store.get(id))?.length).toEqual(2);
  });

  it("refuses a session that does not exist", async () => {
    const store = newStore();
    expect(await store.duplicateSession("ghost")).toEqual(null);
  });
});

describe("active session", () => {
  it("round-trips the active session id", async () => {
    const store = newStore();
    const id = await store.create();
    expect(await store.getActiveSessionId()).toEqual(null);
    await store.setActiveSessionId(id);
    expect(await store.getActiveSessionId()).toEqual(id);
  });

  it("clears the active session id", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setActiveSessionId(id);
    await store.setActiveSessionId(null);
    expect(await store.getActiveSessionId()).toEqual(null);
  });

  it("drops the active pointer and the draft when a session is deleted", async () => {
    const store = newStore();
    const id = await store.create();
    await store.setActiveSessionId(id);
    await store.setDraft(id, "unfinished thought");
    await store.deleteSession(id);
    expect(await store.getActiveSessionId()).toEqual(null);
    expect(await store.getDraft(id)).toEqual("");
  });
});

describe("sessions", () => {
  it("creates a session and reads it back as an empty conversation", async () => {
    const store = newStore();
    const id = await store.create();
    expect(typeof id).toEqual("string");
    expect(await store.get(id)).toEqual([]);
  });

  it("returns null for a session that does not exist", async () => {
    expect(await newStore().get("nope")).toEqual(null);
  });

  it("round-trips a user turn and an assistant turn in order", async () => {
    const store = newStore();
    const id = await store.create();
    const at = Date.now();
await store.append(id, { role: "user", content: "hi", at });
    await store.append(id, { role: "assistant", content: "hello", at });
    // Ids are asserted separately: they embed a timestamp, so a literal
    // in the deepEqual would be both unreadable and unstable.
    const turns = await store.get(id);
    expect(turns?.map(({ role, content, type, at: seen }) => ({
        role,
        content,
        type,
        at: seen,
      }))).toEqual([
        { role: "user", content: "hi", type: "text", at },
        { role: "assistant", content: "hello", type: "text", at },
      ]);
    expect(turns?.every((t) => typeof t.id === "string" && t.id !== "")).toBeTruthy();
    expect(turns?.[0].id).not.toEqual(turns?.[1].id);
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
    expect((await store.get(id))?.map((t) => t.content)).toEqual(["one", "two", "three"]);
  });

  it("defaults the type and stamps a missing timestamp", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "hi" });
    const turn = (await store.get(id))?.[0];
    expect(turn?.type).toEqual("text");
    expect(typeof turn?.at).toEqual("number");
  });

  it("keeps sessions isolated from one another", async () => {
    const store = newStore();
    const a = await store.create();
    const b = await store.create();
    await store.append(a, { role: "user", content: "only a" });
    expect(await store.get(b)).toEqual([]);
  });
});

describe("lazy hydration (C17)", () => {
  const src = readSource("services/chat/tinybase-store.ts");

  it("lists sessions without reading turn bodies", async () => {
    const { store, tiny } = newStoreRaw();
    const id = await store.create();
    await store.append(id, { role: "user", content: "hi", at: 1 });
    // Wipe the bodies: the list must not need them...
    tiny.setTable("messages", {});
    const listed = await store.listSessions();
    expect(listed.length).toEqual(1);
    expect(listed[0].id).toEqual(id);
    // ...and the source-level guard — the list path never maps a turn.
    const start = src.indexOf("async listSessions");
    const ends = ["\n  async ", "\n  private "]
      .map((marker) => src.indexOf(marker, start + 10))
      .filter((i) => i > 0);
    const body = src.slice(start, ends.length > 0 ? Math.min(...ends) : start + 500);
    expect(body).toMatch(/getTable\("sessions"\)/);
    expect(body).not.toMatch(/rowsOf|toTurn|this\.get\(/);
  });

  it("hydrates once: a re-open serves the first read", async () => {
    const { store, tiny } = newStoreRaw();
    const id = await store.create();
    await store.append(id, { role: "user", content: "hello", at: 1 });
    const first = await store.get(id);
    expect(first?.[0].content).toEqual("hello");
    // Write BEHIND the port: the port is the ONLY writer (ADR-0012), so
    // a hydrate-once guard must not see this — re-reading is exactly
    // what "re-opening does not re-read" forbids.
    tiny.setCell("messages", first![0].id, "content", "ghost");
    const second = await store.get(id);
    expect(second?.[0].content).toEqual("hello");
  });

  it("never hides a write: append after hydration is visible", async () => {
    // THE data-loss guard. A stale cache showing an old transcript
    // looks exactly like lost data — every writer must invalidate.
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "one", at: 1 });
    await store.get(id); // hydrate
    await store.append(id, { role: "assistant", content: "two", at: 2 });
    const turns = await store.get(id);
    expect(turns?.length).toEqual(2);
    expect(turns?.[1].content).toEqual("two");
  });

  it("never hides truncate or pop either", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "q", at: 1 });
    await store.append(id, { role: "assistant", content: "a", at: 2 });
    const hydrated = await store.get(id);
    expect(hydrated?.length).toEqual(2);
    expect(await store.truncateFrom(id, hydrated![0].id)).toEqual(true);
    expect((await store.get(id))?.length).toEqual(0);

    await store.append(id, { role: "user", content: "q2", at: 3 });
    await store.append(id, { role: "assistant", content: "a2", at: 4 });
    await store.get(id); // hydrate again
    expect(await store.popLastAssistant(id)).toEqual(true);
    expect((await store.get(id))?.length).toEqual(1);
  });

  it("a deleted session reads as gone, never as its cached transcript", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "bye", at: 1 });
    await store.get(id);
    expect(await store.deleteSession(id)).toEqual(true);
    expect(await store.get(id)).toEqual(null);
  });

  it("duplicates the hydrated transcript exactly", async () => {
    const store = newStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "src", at: 1 });
    await store.get(id); // hydrate the source first
    const copy = await store.duplicateSession(id);
    expect(copy).toBeTruthy();
    const copied = await store.get(copy as string);
    expect(copied?.length).toEqual(1);
    expect(copied?.[0].content).toEqual("src");
  });
});
