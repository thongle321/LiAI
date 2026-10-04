/** Chat store tests (local Store sessions + on-device turns).
 * Run: node --test tests/chat-store.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createChatStore } from "../store/chat.ts";
import {
  fakeRunTurn,
  fakeSessionStore,
  gatedRunTurn,
} from "./fakes.ts";

/** A runner that never answers: the session tests never send. */
const idleRunTurn = fakeRunTurn([]).runTurn;

/** `active` seeds the store's active-session pointer — the same job the
 *  old `memoryStorage({liai_session_id})` seed used to do. */
function storeWith(
  seeds: Parameters<typeof fakeSessionStore>[0],
  active: string | null = null,
) {
  const fake = fakeSessionStore(seeds, active);
  return { ...fake, getStore: async () => fake.store, runTurn: idleRunTurn };
}

describe("chat store sessions", () => {
  it("loads the session list and history on loadSession", async () => {
    const { getStore, runTurn } = storeWith([{ id: "s1", title: "Hi" }], "s1");
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    const state = useStore.getState();
    assert.equal(state.sessionId, "s1");
    assert.deepEqual(
      state.sessions.map((s) => s.id),
      ["s1"],
    );
    assert.equal(state.sessions[0].title, "Hi");
  });

  it("starts empty when no session is active, without minting", async () => {
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, null);
    assert.deepEqual(useStore.getState().messages, []);
    assert.equal(fake.calls.creates, 0);
  });

  it("survives a store that cannot be reached", async () => {
    // The active-session pointer lives in the store now, so a store that
    // cannot be read means no active session — never a dangling id.
    const useStore = createChatStore({
      getStore: async () => {
        throw new Error("store down");
      },
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, null);
    assert.deepEqual(useStore.getState().sessions, []);
  });

  it("switchSession loads history with steps and usage", async () => {
    const { getStore, runTurn, store } = storeWith([
      {
        id: "s2",
        title: "T",
        turns: [
          { role: "user", content: "time?", type: "text" },
          {
            role: "assistant",
            content: "It is noon",
            type: "text",
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
            steps: [
              { id: "w1", tool: "get_current_time", position: 0, result: "noon" },
            ],
          },
        ],
      },
    ]);
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().switchSession("s2"), true);
    const state = useStore.getState();
    assert.equal(state.sessionId, "s2");
    assert.deepEqual(
      state.messages.map((m) => [m.role, m.text]),
      [
        ["user", "time?"],
        ["assistant", "It is noon"],
      ],
    );
    assert.deepEqual(state.messages[1].steps, [
      { id: "w1", tool: "get_current_time", position: 0, result: "noon" },
    ]);
    assert.deepEqual(state.messages[1].usage, {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    assert.equal(await store.getActiveSessionId(), "s2");
  });

  it("keeps tool calls in call order", async () => {
    const { getStore, runTurn } = storeWith([
      {
        id: "s2",
        title: "T",
        turns: [
          { role: "user", content: "search?", type: "text" },
          {
            role: "assistant",
            content: "Found it",
            type: "text",
            steps: [
              { id: "b", tool: "web_search", position: 1, result: "second" },
              { id: "a", tool: "read_page", position: 0, result: "first" },
            ],
          },
        ],
      },
    ]);
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().switchSession("s2"), true);
    assert.deepEqual(
      useStore.getState().messages[1].steps?.map((s) => s.tool),
      ["read_page", "web_search"],
    );
  });

  it("renameSession patches the store and updates the row", async () => {
    const { getStore, runTurn } = storeWith([{ id: "s1", title: "Hi" }], "s1");
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().renameSession("s1", "New"), true);
    assert.equal(useStore.getState().sessions[0].title, "New");
  });

  it("renameSession returns false when the store rejects", async () => {
    const fake = fakeSessionStore([{ id: "s1", title: "Hi" }], "s1");
    const useStore = createChatStore({
      getStore: async () => ({
        ...fake.store,
        renameSession: async () => {
          throw new Error("down");
        },
      }),
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().renameSession("s1", "New"), false);
    assert.equal(useStore.getState().sessions[0].title, "Hi");
  });

 it("setPinned toggles pin state through the store", async () => {
 const { getStore, runTurn } = storeWith([{ id: "s1", title: "Hi" }], "s1");
 const useStore = createChatStore({ getStore, runTurn });
 await useStore.getState().loadSession();
 assert.equal(useStore.getState().sessions[0].pinned, false);
 assert.equal(await useStore.getState().setPinned("s1", true), true);
 assert.equal(useStore.getState().sessions[0].pinned, true);
 });

 it("pinning re-sorts from the store, not the stale position", async () => {
 // patchSession must re-list: setCell bumps the sort key (touch), so
 // an in-place title/pin patch would display the new value at the old
 // position until the next refresh.
 const { getStore, runTurn } = storeWith(
 [{ id: "s1", title: "First" }, { id: "s2", title: "Second" }],
 "s1",
 );
 const useStore = createChatStore({ getStore, runTurn });
 await useStore.getState().loadSession();
 assert.deepEqual(
 useStore.getState().sessions.map((s) => s.id),
 ["s1", "s2"],
 );
 // Pinning s2 must move it above s1 the way the drawer sorts
 // (pinned first) — only a store re-list can know the new order.
 assert.equal(await useStore.getState().setPinned("s2", true), true);
 assert.deepEqual(
 useStore.getState().sessions.map((s) => s.id),
 ["s2", "s1"],
 );
 });

  it("deleteSession removes the session and clears the active view", async () => {
    const { getStore, runTurn, store, calls } = storeWith(
      [{ id: "s1", title: "Hi" }],
      "s1",
    );
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    await useStore.getState().deleteSession("s1");
    assert.deepEqual(calls.deletes, ["s1"]);
    const state = useStore.getState();
    assert.deepEqual(state.sessions, []);
    assert.equal(state.sessionId, null);
    assert.equal(await store.getActiveSessionId(), null);
  });

  it("newConversation clears the view without touching the store", async () => {
    const { getStore, runTurn, calls, store } = storeWith(
      [{ id: "s1", title: "Hi" }],
      "s1",
    );
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    await useStore.getState().newConversation();
    const state = useStore.getState();
    assert.equal(state.sessionId, null);
    assert.deepEqual(state.messages, []);
    assert.equal(calls.creates, 0);
    assert.equal(calls.appends.length, 0);
    assert.equal(await store.getActiveSessionId(), null);
  });
});

describe("chat store turns", () => {
  it("streams tokens into a pending bubble, then finalizes", async () => {
    const gate = gatedRunTurn();
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: gate.runTurn,
    });
    const promise = useStore.getState().send("hi");
    assert.equal(useStore.getState().sending, true);
    assert.deepEqual(
      useStore.getState().messages.map((m) => [m.role, m.streaming ?? false]),
      [
        ["user", false],
        ["assistant", true],
      ],
    );
    gate.release("Echo hi");
    await promise;
    const state = useStore.getState();
    assert.equal(state.sending, false);
    assert.deepEqual(
      state.messages.map((m) => [m.role, m.text]),
      [
        ["user", "hi"],
        ["assistant", "Echo hi"],
      ],
    );
    assert.equal(state.messages[1].streaming, false);
    assert.deepEqual(state.messages[1].usage, {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    assert.equal(state.sessionId, "s-new");
    assert.equal(await fake.store.getActiveSessionId(), "s-new");
    assert.equal(state.draft, "");
    assert.equal(await fake.store.getDraft("s-new"), "");
  });

  it("keeps the turn's tool calls on the bubble", async () => {
    const { runTurn } = fakeRunTurn([
      {
        reply: "done",
        steps: [
          {
            id: "w1",
            tool: "web_search",
            position: 0,
            input: { query: "q" },
            result: "R",
          },
        ],
      },
    ]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("search?");
    assert.deepEqual(useStore.getState().messages[1].steps, [
      {
        id: "w1",
        tool: "web_search",
        position: 0,
        input: { query: "q" },
        result: "R",
      },
    ]);
  });

  it("keeps streamed reasoning on the bubble and clears it on regenerate", async () => {
    const replies: Array<{ reply: string; reasoning?: string }> = [
      { reply: "one", reasoning: "why not" },
      { reply: "two" },
    ];
    let call = 0;
    const runTurn = async (
      _text: string,
      _paths: unknown,
      _onToken?: (t: string) => void,
      onReasoning?: (c: string) => void,
    ) => {
      const r = replies[call++];
      if (r.reasoning !== undefined) onReasoning?.(r.reasoning);
      return {
        reply: r.reply,
        ...(r.reasoning !== undefined ? { reasoning: r.reasoning } : {}),
        sessionId: "s-new",
        steps: [],
        promptTokens: 1,
        completionTokens: 1,
      };
    };
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hi");
    assert.equal(useStore.getState().messages[1].reasoning, "why not");
    // Regenerate must not resurrect old reasoning when the rerun emits
    // none (clearOnFirst resets the bubble).
    const id = useStore.getState().messages[1].id;
    await useStore.getState().regenerate(id);
    assert.equal(useStore.getState().messages[1].reasoning, undefined);
  });

  it("marks the bubble when the runner fails", async () => {
    const { runTurn } = fakeRunTurn([{ fail: "boom" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hi");
    const state = useStore.getState();
    assert.equal(state.sending, false);
    assert.deepEqual(state.messages[1].error, {
      code: "llm_error",
      message: "boom",
    });
  });

  it("retry on a failed assistant reruns the prior question", async () => {
    const { runTurn, calls } = fakeRunTurn([
      { fail: "slow" },
      { reply: "recovered" },
    ]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hi");
    const failedId = useStore.getState().messages[1].id;
    await useStore.getState().retry(failedId);
    assert.deepEqual(calls.texts, ["hi", "hi"]);
    const state = useStore.getState();
    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[1].text, "recovered");
    assert.equal(state.messages[1].error, undefined);
  });

  it("retry on a bubble without error returns false", async () => {
    const { runTurn, calls } = fakeRunTurn([{ reply: "ok" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hi");
    assert.equal(await useStore.getState().retry(useStore.getState().messages[0].id), false);
    assert.deepEqual(calls.texts, ["hi"]);
  });

  it("regenerate replaces a completed reply and pops the stored turn", async () => {
    const { getStore, store } = storeWith(
      [
        {
          id: "s1",
          title: "T",
          turns: [
            { role: "user", content: "hi", type: "text" },
            { role: "assistant", content: "first", type: "text" },
          ],
        },
      ],
      "s1",
    );
    const { runTurn: run, calls } = fakeRunTurn([{ reply: "second" }]);
    const useStore = createChatStore({ getStore, runTurn: run });
    await useStore.getState().loadSession();
    const assistantId = useStore.getState().messages[1].id;
    await useStore.getState().regenerate(assistantId);
    assert.deepEqual(calls.texts, ["hi"]);
    assert.equal(useStore.getState().messages[1].text, "second");
    // The store level pops the stale turn; the re-append is the turn
    // builder's tested job (the fake runner bypasses it by design).
    const stored = await store.get("s1");
    assert.deepEqual(
      stored?.map((t) => t.content),
      ["hi"],
    );
  });

  it("blocked sends return false and change nothing", async () => {
    const { runTurn, calls } = fakeRunTurn([]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    assert.equal(await useStore.getState().send("   "), false);
    assert.deepEqual(useStore.getState().messages, []);
    assert.deepEqual(calls.texts, []);
  });

  it("ignores a second send while a turn is in flight", async () => {
    const gate = gatedRunTurn();
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: gate.runTurn,
    });
    const first = useStore.getState().send("one");
    assert.equal(await useStore.getState().send("two"), false);
    gate.release("Echo one");
    await first;
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["one", "Echo one"],
    );
  });

  it("checkHealth reflects engine readiness, not the network", async () => {
    const up = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: fakeRunTurn([]).runTurn,
      getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }),
    });
    await up.getState().checkHealth();
    assert.equal(up.getState().connection, "up");
    const down = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: fakeRunTurn([]).runTurn,
      getEngineSource: async () => null,
    });
    await down.getState().checkHealth();
    assert.equal(down.getState().connection, "down");
  });
});

describe("chat store regenerate from any turn", () => {
  /** A loaded conversation of four turns: q1 a1 q2 a2. */
  function fourTurns() {
    const seeded = storeWith(
      [
        {
          id: "s1",
          title: "T",
          turns: [
            { role: "user", content: "q1", type: "text" },
            { role: "assistant", content: "a1", type: "text" },
            { role: "user", content: "q2", type: "text" },
            { role: "assistant", content: "a2", type: "text" },
          ],
        },
      ],
      "s1",
    );
    return seeded;
  }

  it("re-answers an EARLIER turn and discards everything after it", async () => {
    // The whole point of the feature: re-running anything but the last
    // turn is meaningless unless the branch it sits on can be deleted.
    const seeded = fourTurns();
    const { runTurn, calls } = fakeRunTurn([{ reply: "a1-again" }]);
    const useStore = createChatStore({
      getStore: seeded.getStore,
      runTurn,
    });
    await useStore.getState().loadSession();
    const firstAnswer = useStore.getState().messages[1].id;
    assert.equal(await useStore.getState().regenerate(firstAnswer), true);

    assert.deepEqual(calls.texts, ["q1"], "it re-asks the question that was answered");
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["q1", "a1-again"],
      "the later turns are gone from the thread too",
    );
    // The store is left EMPTY, not merely missing the tail: truncateFrom
    // starts at the QUESTION, because the question is about to be re-sent.
    // The re-append is the turn builder's job (see local-turn.test.ts) --
    // the fake runner bypasses persistence by design.
    assert.deepEqual(await seeded.store.get("s1"), []);
  });

  it("pins the bubble ids so the rewritten turn stays addressable", async () => {
    const seeded = fourTurns();
    const { runTurn } = fakeRunTurn([{ reply: "again" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    const questionId = useStore.getState().messages[0].id;
    const answerId = useStore.getState().messages[1].id;
    await useStore.getState().regenerate(answerId);
    const after = useStore.getState().messages;
    assert.deepEqual(
      after.map((m) => m.id),
      [questionId, answerId],
      "the question and the answer keep the ids they had",
    );
  });

  it("keeps everything before the re-asked question", async () => {
    const seeded = storeWith(
      [
        {
          id: "s1",
          title: "T",
          turns: [
            { role: "user", content: "k1", type: "text" },
            { role: "assistant", content: "ka1", type: "text" },
            { role: "user", content: "k2", type: "text" },
            { role: "assistant", content: "ka2", type: "text" },
            { role: "user", content: "k3", type: "text" },
            { role: "assistant", content: "ka3", type: "text" },
          ],
        },
      ],
      "s1",
    );
    const { runTurn } = fakeRunTurn([{ reply: "ka2-again" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    // Regenerate the THIRD turn (ka2): only a mid-thread regenerate
    // exercises the truncation branch at all, and only here is there
    // anything before the question to preserve.
    await useStore.getState().regenerate(useStore.getState().messages[3].id);
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["k1", "ka1", "k2", "ka2-again"],
      "the prefix survives; the question onward is rewritten",
    );
  });

  it("still regenerates the LAST turn through the cheap path", async () => {
    // The existing behaviour must not regress: nothing follows, so this is
    // a plain retry of a stored question.
    const seeded = fourTurns();
    const { runTurn, calls } = fakeRunTurn([{ reply: "a2-again" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    const lastAnswer = useStore.getState().messages[3].id;
    assert.equal(await useStore.getState().regenerate(lastAnswer), true);
    assert.deepEqual(calls.texts, ["q2"]);
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["q1", "a1", "q2", "a2-again"],
      "earlier turns untouched",
    );
  });

  it("refuses a user turn, an errored turn, and a mid-turn call", async () => {
    const seeded = fourTurns();
    const { runTurn } = fakeRunTurn([]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().regenerate(useStore.getState().messages[0].id), false);
    assert.equal(await useStore.getState().regenerate("nope"), false);
  });
});

describe("chat store edit mode", () => {
  /** Two turns: q1 a1. Enough to prove the rewrite reaches history. */
  function pair() {
    const seeded = storeWith(
      [
        {
          id: "s1",
          title: "T",
          turns: [
            { role: "user", content: "q1", type: "text" },
            { role: "assistant", content: "a1", type: "text" },
          ],
        },
      ],
      "s1",
    );
    return seeded;
  }

  it("seeds the composer with the turn being edited", async () => {
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: fakeRunTurn([]).runTurn });
    await useStore.getState().loadSession();
    const questionId = useStore.getState().messages[0].id;
    assert.equal(useStore.getState().startEdit(questionId), true);
    assert.equal(useStore.getState().editingTurnId, questionId);
    assert.equal(useStore.getState().draft, "q1");
  });

  it("refuses an assistant turn: that is regenerate, not edit", async () => {
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: fakeRunTurn([]).runTurn });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().startEdit(useStore.getState().messages[1].id), false);
    assert.equal(useStore.getState().editingTurnId, null);
  });

  it("refuses an unknown turn, and with nothing persisted to rewind", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    assert.equal(useStore.getState().startEdit("nope"), false);
    // Bubbles exist but no session was ever created.
    useStore.setState({ messages: [{ id: "m1", role: "user", text: "hi", at: 1 }] });
    assert.equal(useStore.getState().startEdit("m1"), false);
  });

  it("refuses while a turn is running", async () => {
    const gate = gatedRunTurn();
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: gate.runTurn });
    await useStore.getState().loadSession();
    const questionId = useStore.getState().messages[0].id;
    const sent = useStore.getState().send("more");
    assert.equal(useStore.getState().startEdit(questionId), false);
    gate.release("done");
    await sent;
  });

  it("restores the composer to the turn's text on cancel", async () => {
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: fakeRunTurn([]).runTurn });
    await useStore.getState().loadSession();
    const questionId = useStore.getState().messages[0].id;
    useStore.getState().startEdit(questionId);
    // The user starts retyping, then backs out.
    useStore.setState({ draft: "half written" });
    useStore.getState().cancelEdit();
    assert.equal(useStore.getState().editingTurnId, null);
    assert.equal(useStore.getState().draft, "q1", "not the half-written text");
  });

  it("cancel is a no-op when not editing", async () => {
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: fakeRunTurn([]).runTurn });
    await useStore.getState().loadSession();
    useStore.setState({ draft: "typing" });
    useStore.getState().cancelEdit();
    assert.equal(useStore.getState().draft, "typing", "an unrelated draft survives");
  });

  it("rewrites the edited turn and everything after it on send", async () => {
    // The defining behaviour: an edit replaces the branch, it does not
    // append beside it.
    const seeded = storeWith(
      [
        {
          id: "s1",
          title: "T",
          turns: [
            { role: "user", content: "keep", type: "text" },
            { role: "assistant", content: "kept", type: "text" },
            { role: "user", content: "typo here", type: "text" },
            { role: "assistant", content: "wrong answer", type: "text" },
          ],
        },
      ],
      "s1",
    );
    const { runTurn, calls } = fakeRunTurn([{ reply: "right answer" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    const typoId = useStore.getState().messages[2].id;
    useStore.getState().startEdit(typoId);

    assert.equal(await useStore.getState().send("typo fixed"), true);
    assert.deepEqual(calls.texts, ["typo fixed"]);
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["keep", "kept", "typo fixed", "right answer"],
    );
    assert.equal(
      useStore.getState().editingTurnId,
      null,
      "edit mode ends when the edit is committed",
    );
    assert.equal(useStore.getState().draft, "", "and the composer is spent");
  });

  it("keeps the edited turn's id so it stays addressable", async () => {
    const seeded = pair();
    const { runTurn } = fakeRunTurn([{ reply: "again" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    const questionId = useStore.getState().messages[0].id;
    useStore.getState().startEdit(questionId);
    await useStore.getState().send("better question");
    assert.equal(useStore.getState().messages[0].id, questionId);
  });

  it("leaves a normal send untouched", async () => {
    const seeded = pair();
    const { runTurn, calls } = fakeRunTurn([{ reply: "ok" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    await useStore.getState().send("new question");
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.text),
      ["q1", "a1", "new question", "ok"],
    );
    assert.equal(useStore.getState().editingTurnId, null);
    assert.deepEqual(calls.texts, ["new question"]);
  });
});
describe("turn timing (G13)", () => {
  it("stamps the start of a turn and clears it when the turn settles", async () => {
    // The pending row reads this to show elapsed time; three dots alone
    // were indistinguishable from a frozen screen.
    const { runTurn } = fakeRunTurn([{ reply: "ok" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    assert.equal(useStore.getState().turnStartedAt, null, "nothing running at rest");
    await useStore.getState().send("hi");
    assert.equal(
      useStore.getState().turnStartedAt,
      null,
      "cleared once the turn settled",
    );
  });

  it("stamps while the turn is still in flight", async () => {
    const gate = gatedRunTurn();
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: gate.runTurn,
    });
    const sent = useStore.getState().send("hi");
    const stamp = useStore.getState().turnStartedAt;
    assert.equal(typeof stamp, "number", "stamped for the pending row to read");
    gate.release("done");
    await sent;
    assert.equal(useStore.getState().turnStartedAt, null);
  });

  it("clears on Stop, so a stale stamp cannot outlive the turn", async () => {
    const gate = gatedRunTurn();
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: gate.runTurn,
    });
    const sent = useStore.getState().send("hi");
    useStore.getState().stop();
    assert.equal(useStore.getState().turnStartedAt, null);
    gate.release("done");
    await sent;
    assert.equal(useStore.getState().turnStartedAt, null);
  });

  it("clears when a turn fails", async () => {
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: async () => {
        throw new Error("engine died");
      },
    });
    await useStore.getState().send("hi");
    assert.equal(useStore.getState().turnStartedAt, null);
  });

  it("clears on a new conversation", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    useStore.setState({ turnStartedAt: 1234 });
    await useStore.getState().newConversation();
    assert.equal(
      useStore.getState().turnStartedAt,
      null,
      "no stamp survives into a conversation with no turn",
    );
  });
});

describe("chat warnings (G7)", () => {
  it("sets and clears the notice", () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    assert.equal(useStore.getState().chatWarning, null, "quiet at rest");
    useStore.getState().setChatWarning({
      message: "something",
      severity: "warning",
      recoverable: false,
    });
    assert.equal(useStore.getState().chatWarning?.message, "something");
    useStore.getState().setChatWarning(null);
    assert.equal(useStore.getState().chatWarning, null);
  });

  it("does not follow the user into another conversation", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    useStore.getState().setChatWarning({
      message: "the image was dropped",
      severity: "warning",
      recoverable: false,
    });
    await useStore.getState().newConversation();
    assert.equal(
      useStore.getState().chatWarning,
      null,
      "a notice is only ever true of the turn that raised it",
    );
  });

  it("every conversation-reset site clears it, not just the one above", () => {
    // newConversation, switchSession, deleteSession and duplicateSession
    // each replace the visible conversation. Missing one leaks the notice
    // into a chat it has nothing to do with, so the count is pinned
    // rather than trusting four separate call sites to be remembered.
    const src = readFileSync("store/chat/sessions.ts", "utf8");
    assert.equal(
      src.split("chatWarning: null").length - 1,
      4,
      "newConversation, switchSession, deleteSession, duplicateSession",
    );
  });
});

describe("multimodal warning (G12)", () => {
  it("sends the text, drops the image the model cannot see, and says so", async () => {
    // PocketParity: useChatSession.ts:97-105 still sends the message as
    // plain text when images ride a turn with no vision, and raises a
    // warning. It does not block, and it does not fail the turn.
    const { runTurn, calls } = fakeRunTurn([{ reply: "a text model" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("what is this?", "data:image/jpeg;base64,AAAA");

    assert.equal(calls.texts[0], "what is this?", "the text still went out");
    assert.equal(
      calls.images[0],
      undefined,
      "the engine was never handed an image it cannot read",
    );
    const w = useStore.getState().chatWarning;
    assert.notEqual(w, null, "the user is told, rather than guessing");
    assert.equal(w?.severity, "warning", "the turn went through, degraded");
    assert.equal(w?.recoverable, false, "PocketPal's own multimodal warning");
  });

  it("stays quiet when no image is attached", async () => {
    const { runTurn } = fakeRunTurn([{ reply: "ok" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hello");
    assert.equal(
      useStore.getState().chatWarning,
      null,
      "a text-only turn must not raise a multimodal notice",
    );
  });

  it("the guard lives in runLocal, so every re-run path shares it", () => {
    // send, retry, regenerate and edit all funnel through runLocal. A
    // guard written per-caller would let one of them drift into handing a
    // text-only model an image again -- so pin the shape, not four copies.
    const src = readFileSync("store/chat/send.ts", "utf8");
    assert.match(
      src,
      /const image = multimodalAvailable\(\) \? opts\.image : undefined;/,
    );
    // Exactly one place decides, so it cannot be bypassed downstream.
    assert.equal(
      src.split("multimodalAvailable()").length - 1,
      2,
      "one definition and one use -- no second caller to drift",
    );
  });
});

describe("session import (G10)", () => {
  const backup = (title: string, content: string) =>
    JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      title,
      turns: [
        { role: "user", content, at: 1, type: "text" },
        { role: "assistant", content: "reply", at: 2, type: "text" },
      ],
    });

  it("writes a valid backup and mints FRESH ids", async () => {
    // Fresh ids are the whole point: importing the file's own would make a
    // second import of the same backup collide with the first.
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    const out = await useStore.getState().importSessions(backup("Restored", "hi"));
    assert.equal(out.ok, true);
    assert.equal(out.imported, 1);
    assert.equal(out.skipped, 0);
    await useStore.getState().refreshSessions();
    const titles = useStore.getState().sessions.map((s) => s.title);
    assert.ok(titles.includes("Restored"), `got ${titles.join(", ")}`);
  });

  it("refuses a bad file without writing anything", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    const out = await useStore.getState().importSessions("not json");
    assert.equal(out.ok, false);
    assert.equal(out.imported, 0);
    await useStore.getState().refreshSessions();
    assert.equal(useStore.getState().sessions.length, 0, "nothing half-written");
  });

  it("importing the same backup twice yields two conversations", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    const text = backup("Twice", "hello");
    await useStore.getState().importSessions(text);
    await useStore.getState().importSessions(text);
    await useStore.getState().refreshSessions();
    assert.equal(
      useStore.getState().sessions.filter((s) => s.title === "Twice").length,
      2,
      "ids must not collide and overwrite",
    );
  });
});

describe("message identity", () => {
  it("gives every bubble the row id it was persisted under", async () => {
    // The one-identity contract (Q9): a bubble's id IS its row id, so a
    // bubble read back from storage is addressable by the same id it had
    // live. Regenerate-from-the-middle and edit both depend on it.
    const seeded = storeWith(
      [
        {
          id: "s1",
          title: "T",
          turns: [
            { role: "user", content: "q1", type: "text" },
            { role: "assistant", content: "a1", type: "text" },
          ],
        },
      ],
      "s1",
    );
    const useStore = createChatStore({
      getStore: seeded.getStore,
      runTurn: seeded.runTurn,
    });
    await useStore.getState().loadSession();
    const stored = await seeded.store.get("s1");
    assert.deepEqual(
      useStore.getState().messages.map((m) => m.id),
      stored?.map((t) => t.id),
    );
    assert.ok(stored?.every((t) => typeof t.id === "string" && t.id !== ""));
  });
});
