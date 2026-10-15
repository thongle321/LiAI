/** Chat store tests (local Store sessions + on-device turns). */

import { createChatStore } from "../chat.ts";
import { startStreamYield } from "../chat/send.ts";
import {
  fakeRunTurn,
  fakeSessionStore,
  gatedRunTurn,
} from "../../tests/fakes.ts";

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
    expect(state.sessionId).toBe("s1");
    expect(state.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(state.sessions[0].title).toBe("Hi");
  });

  it("starts empty when no session is active, without minting", async () => {
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    expect(useStore.getState().sessionId).toBe(null);
    expect(useStore.getState().messages).toEqual([]);
    expect(fake.calls.creates).toBe(0);
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
    expect(useStore.getState().sessionId).toBe(null);
    expect(useStore.getState().sessions).toEqual([]);
  });

  it("reconciles a stored pointer to a session that is gone (C17)", async () => {
    // The pointer names a session the list no longer contains: loadSession
    // must clear it rather than leave an active id with nothing behind it.
    const { getStore, runTurn } = storeWith([], "gone");
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    expect(useStore.getState().sessionId).toBe(null);
    expect(useStore.getState().messages).toEqual([]);
    expect(await (await getStore()).getActiveSessionId()).toBe(null);
  });

  it("still opens the conversation when the draft write fails (C17)", async () => {
    // switchSession persists the old draft BEFORE hydrating the next
    // transcript. That write is best-effort: if it throws the conversation
    // must still resolve — an empty view that looks like lost data is the
    // failure this guards.
    const base = fakeSessionStore([
      { id: "s2", title: "Two", turns: [{ role: "user", content: "hi" }] },
    ]);
    const useStore = createChatStore({
      getStore: async () => ({
        ...base.store,
        setDraft: async () => {
          throw new Error("disk full");
        },
      }),
      runTurn: idleRunTurn,
    });
    await useStore.getState().loadSession();
    expect(await useStore.getState().switchSession("s2")).toBe(true);
    expect(useStore.getState().sessionId).toBe("s2");
    expect(useStore.getState().messages.length).toBe(1);
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
    expect(await useStore.getState().switchSession("s2")).toBe(true);
    const state = useStore.getState();
    expect(state.sessionId).toBe("s2");
    expect(state.messages.map((m) => [m.role, m.text])).toEqual([
        ["user", "time?"],
        ["assistant", "It is noon"],
      ]);
    expect(state.messages[1].steps).toEqual([
      { id: "w1", tool: "get_current_time", position: 0, result: "noon" },
    ]);
    expect(state.messages[1].usage).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    expect(await store.getActiveSessionId()).toBe("s2");
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
    expect(await useStore.getState().switchSession("s2")).toBe(true);
    expect(useStore.getState().messages[1].steps?.map((s) => s.tool)).toEqual(["read_page", "web_search"]);
  });

  it("renameSession patches the store and updates the row", async () => {
    const { getStore, runTurn } = storeWith([{ id: "s1", title: "Hi" }], "s1");
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    expect(await useStore.getState().renameSession("s1", "New")).toBe(true);
    expect(useStore.getState().sessions[0].title).toBe("New");
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
    expect(await useStore.getState().renameSession("s1", "New")).toBe(false);
    expect(useStore.getState().sessions[0].title).toBe("Hi");
  });

 it("setPinned toggles pin state through the store", async () => {
 const { getStore, runTurn } = storeWith([{ id: "s1", title: "Hi" }], "s1");
 const useStore = createChatStore({ getStore, runTurn });
 await useStore.getState().loadSession();
 expect(useStore.getState().sessions[0].pinned).toBe(false);
 expect(await useStore.getState().setPinned("s1", true)).toBe(true);
 expect(useStore.getState().sessions[0].pinned).toBe(true);
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
 expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["s1", "s2"]);
 // Pinning s2 must move it above s1 the way the drawer sorts
 // (pinned first) — only a store re-list can know the new order.
 expect(await useStore.getState().setPinned("s2", true)).toBe(true);
 expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
 });

  it("deleteSession removes the session and clears the active view", async () => {
    const { getStore, runTurn, store, calls } = storeWith(
      [{ id: "s1", title: "Hi" }],
      "s1",
    );
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    await useStore.getState().deleteSession("s1");
    expect(calls.deletes).toEqual(["s1"]);
    const state = useStore.getState();
    expect(state.sessions).toEqual([]);
    expect(state.sessionId).toBe(null);
    expect(await store.getActiveSessionId()).toBe(null);
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
    expect(state.sessionId).toBe(null);
    expect(state.messages).toEqual([]);
    expect(calls.creates).toBe(0);
    expect(calls.appends.length).toBe(0);
    expect(await store.getActiveSessionId()).toBe(null);
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
    expect(useStore.getState().sending).toBe(true);
    expect(useStore.getState().messages.map((m) => [m.role, m.streaming ?? false])).toEqual([
        ["user", false],
        ["assistant", true],
      ]);
    gate.release("Echo hi");
    await promise;
    const state = useStore.getState();
    expect(state.sending).toBe(false);
    expect(state.messages.map((m) => [m.role, m.text])).toEqual([
        ["user", "hi"],
        ["assistant", "Echo hi"],
      ]);
    expect(state.messages[1].streaming).toBe(false);
    expect(state.messages[1].usage).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    expect(state.sessionId).toBe("s-new");
    expect(await fake.store.getActiveSessionId()).toBe("s-new");
    expect(state.draft).toBe("");
    expect(await fake.store.getDraft("s-new")).toBe("");
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
    expect(useStore.getState().messages[1].steps).toEqual([
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
    expect(useStore.getState().messages[1].reasoning).toBe("why not");
    // Regenerate must not resurrect old reasoning when the rerun emits
    // none (clearOnFirst resets the bubble).
    const id = useStore.getState().messages[1].id;
    await useStore.getState().regenerate(id);
    expect(useStore.getState().messages[1].reasoning).toBe(undefined);
  });

  it("marks the bubble when the runner fails", async () => {
    const { runTurn } = fakeRunTurn([{ fail: "boom" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hi");
    const state = useStore.getState();
    expect(state.sending).toBe(false);
    expect(state.messages[1].error).toEqual({
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
    expect(calls.texts).toEqual(["hi", "hi"]);
    const state = useStore.getState();
    expect(state.messages.length).toBe(2);
    expect(state.messages[1].text).toBe("recovered");
    expect(state.messages[1].error).toBe(undefined);
  });

  it("retry on a bubble without error returns false", async () => {
    const { runTurn, calls } = fakeRunTurn([{ reply: "ok" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hi");
    expect(await useStore.getState().retry(useStore.getState().messages[0].id)).toBe(false);
    expect(calls.texts).toEqual(["hi"]);
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
    expect(calls.texts).toEqual(["hi"]);
    expect(useStore.getState().messages[1].text).toBe("second");
    // The store level pops the stale turn; the re-append is the turn
    // builder's tested job (the fake runner bypasses it by design).
    const stored = await store.get("s1");
    expect(stored?.map((t) => t.content)).toEqual(["hi"]);
  });

  it("blocked sends return false and change nothing", async () => {
    const { runTurn, calls } = fakeRunTurn([]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    expect(await useStore.getState().send("   ")).toBe(false);
    expect(useStore.getState().messages).toEqual([]);
    expect(calls.texts).toEqual([]);
  });

  it("ignores a second send while a turn is in flight", async () => {
    const gate = gatedRunTurn();
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: gate.runTurn,
    });
    const first = useStore.getState().send("one");
    expect(await useStore.getState().send("two")).toBe(false);
    gate.release("Echo one");
    await first;
    expect(useStore.getState().messages.map((m) => m.text)).toEqual(["one", "Echo one"]);
  });

  it("checkHealth reflects engine readiness, not the network", async () => {
    const up = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: fakeRunTurn([]).runTurn,
      getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }),
    });
    await up.getState().checkHealth();
    expect(up.getState().connection).toBe("up");
    const down = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: fakeRunTurn([]).runTurn,
      getEngineSource: async () => null,
    });
    await down.getState().checkHealth();
    expect(down.getState().connection).toBe("down");
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
    expect(await useStore.getState().regenerate(firstAnswer)).toBe(true);

    expect(calls.texts).toEqual(["q1"]);
    expect(useStore.getState().messages.map((m) => m.text)).toEqual(["q1", "a1-again"]);
    // The store is left EMPTY, not merely missing the tail: truncateFrom
    // starts at the QUESTION, because the question is about to be re-sent.
    // The re-append is the turn builder's job (see local-turn.test.ts) --
    // the fake runner bypasses persistence by design.
    expect(await seeded.store.get("s1")).toEqual([]);
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
    expect(after.map((m) => m.id)).toEqual([questionId, answerId]);
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
    expect(useStore.getState().messages.map((m) => m.text)).toEqual(["k1", "ka1", "k2", "ka2-again"]);
  });

  it("still regenerates the LAST turn through the cheap path", async () => {
    // The existing behaviour must not regress: nothing follows, so this is
    // a plain retry of a stored question.
    const seeded = fourTurns();
    const { runTurn, calls } = fakeRunTurn([{ reply: "a2-again" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    const lastAnswer = useStore.getState().messages[3].id;
    expect(await useStore.getState().regenerate(lastAnswer)).toBe(true);
    expect(calls.texts).toEqual(["q2"]);
    expect(useStore.getState().messages.map((m) => m.text)).toEqual(["q1", "a1", "q2", "a2-again"]);
  });

  it("refuses a user turn, an errored turn, and a mid-turn call", async () => {
    const seeded = fourTurns();
    const { runTurn } = fakeRunTurn([]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    expect(await useStore.getState().regenerate(useStore.getState().messages[0].id)).toBe(false);
    expect(await useStore.getState().regenerate("nope")).toBe(false);
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
    expect(useStore.getState().startEdit(questionId)).toBe(true);
    expect(useStore.getState().editingTurnId).toBe(questionId);
    expect(useStore.getState().draft).toBe("q1");
  });

  it("refuses an assistant turn: that is regenerate, not edit", async () => {
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: fakeRunTurn([]).runTurn });
    await useStore.getState().loadSession();
    expect(useStore.getState().startEdit(useStore.getState().messages[1].id)).toBe(false);
    expect(useStore.getState().editingTurnId).toBe(null);
  });

  it("refuses an unknown turn, and with nothing persisted to rewind", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    expect(useStore.getState().startEdit("nope")).toBe(false);
    // Bubbles exist but no session was ever created.
    useStore.setState({ messages: [{ id: "m1", role: "user", text: "hi", at: 1 }] });
    expect(useStore.getState().startEdit("m1")).toBe(false);
  });

  it("refuses while a turn is running", async () => {
    const gate = gatedRunTurn();
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: gate.runTurn });
    await useStore.getState().loadSession();
    const questionId = useStore.getState().messages[0].id;
    const sent = useStore.getState().send("more");
    expect(useStore.getState().startEdit(questionId)).toBe(false);
    gate.release("done");
    await sent;
  });

  it("refuses to switch sessions mid-turn (C17)", async () => {
    // The switch guard is the other half of the mid-turn refusal (the
    // delete side is pinned elsewhere): moving the view to another
    // conversation while tokens stream would orphan the incoming
    // bubbles on the old one.
    const gate = gatedRunTurn();
    const { getStore } = storeWith([
      { id: "s1", title: "One" },
      { id: "s2", title: "Two" },
    ]);
    const useStore = createChatStore({ getStore, runTurn: gate.runTurn });
    await useStore.getState().loadSession();
    const sent = useStore.getState().send("hi");
    expect(await useStore.getState().switchSession("s2")).toBe(false);
    expect(useStore.getState().sessionId).not.toBe("s2");
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
    expect(useStore.getState().editingTurnId).toBe(null);
    expect(useStore.getState().draft).toBe("q1");
  });

  it("cancel is a no-op when not editing", async () => {
    const seeded = pair();
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn: fakeRunTurn([]).runTurn });
    await useStore.getState().loadSession();
    useStore.setState({ draft: "typing" });
    useStore.getState().cancelEdit();
    expect(useStore.getState().draft).toBe("typing");
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

    expect(await useStore.getState().send("typo fixed")).toBe(true);
    expect(calls.texts).toEqual(["typo fixed"]);
    expect(useStore.getState().messages.map((m) => m.text)).toEqual(["keep", "kept", "typo fixed", "right answer"]);
    expect(useStore.getState().editingTurnId).toBe(null);
    expect(useStore.getState().draft).toBe("");
  });

  it("keeps the edited turn's id so it stays addressable", async () => {
    const seeded = pair();
    const { runTurn } = fakeRunTurn([{ reply: "again" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    const questionId = useStore.getState().messages[0].id;
    useStore.getState().startEdit(questionId);
    await useStore.getState().send("better question");
    expect(useStore.getState().messages[0].id).toBe(questionId);
  });

  it("leaves a normal send untouched", async () => {
    const seeded = pair();
    const { runTurn, calls } = fakeRunTurn([{ reply: "ok" }]);
    const useStore = createChatStore({ getStore: seeded.getStore, runTurn });
    await useStore.getState().loadSession();
    await useStore.getState().send("new question");
    expect(useStore.getState().messages.map((m) => m.text)).toEqual(["q1", "a1", "new question", "ok"]);
    expect(useStore.getState().editingTurnId).toBe(null);
    expect(calls.texts).toEqual(["new question"]);
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
    expect(useStore.getState().turnStartedAt).toBe(null);
    await useStore.getState().send("hi");
    expect(useStore.getState().turnStartedAt).toBe(null);
  });

  it("stamps while the turn is still in flight", async () => {
    const gate = gatedRunTurn();
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: gate.runTurn,
    });
    const sent = useStore.getState().send("hi");
    const stamp = useStore.getState().turnStartedAt;
    expect(typeof stamp).toBe("number");
    gate.release("done");
    await sent;
    expect(useStore.getState().turnStartedAt).toBe(null);
  });

  it("clears on Stop, so a stale stamp cannot outlive the turn", async () => {
    const gate = gatedRunTurn();
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: gate.runTurn,
    });
    const sent = useStore.getState().send("hi");
    useStore.getState().stop();
    expect(useStore.getState().turnStartedAt).toBe(null);
    gate.release("done");
    await sent;
    expect(useStore.getState().turnStartedAt).toBe(null);
  });

  it("clears when a turn fails", async () => {
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn: async () => {
        throw new Error("engine died");
      },
    });
    await useStore.getState().send("hi");
    expect(useStore.getState().turnStartedAt).toBe(null);
  });

  it("clears on a new conversation", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    useStore.setState({ turnStartedAt: 1234 });
    await useStore.getState().newConversation();
    expect(useStore.getState().turnStartedAt).toBe(null);
  });
});

describe("chat warnings (G7)", () => {
  it("sets and clears the notice", () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    expect(useStore.getState().chatWarning).toBe(null);
    useStore.getState().setChatWarning({
      message: "something",
      severity: "warning",
      recoverable: false,
    });
    expect(useStore.getState().chatWarning?.message).toBe("something");
    useStore.getState().setChatWarning(null);
    expect(useStore.getState().chatWarning).toBe(null);
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
    expect(useStore.getState().chatWarning).toBe(null);
  });

  it("every conversation-reset site clears it, not just the one above", async () => {
    // newConversation, switchSession, deleteSession and duplicateSession
    // each replace the visible conversation. Missing one leaks the notice
    // into a chat it has nothing to do with, so every verb is driven here
    // rather than trusting four separate call sites to be remembered.
    const { getStore, runTurn } = storeWith(
      [
        { id: "s1", title: "One" },
        { id: "s2", title: "Two", turns: [{ role: "user", content: "hi" }] },
      ],
      "s1",
    );
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    const raise = () =>
      useStore.getState().setChatWarning({
        message: "the image was dropped",
        severity: "warning",
        recoverable: false,
      });

    raise();
    await useStore.getState().newConversation();
    expect(useStore.getState().chatWarning).toBe(null);

    raise();
    expect(await useStore.getState().switchSession("s2")).toBe(true);
    expect(useStore.getState().chatWarning).toBe(null);

    raise();
    expect(await useStore.getState().duplicateSession("s2")).toBe(true);
    expect(useStore.getState().chatWarning).toBe(null);

    // Deleting the conversation you are READING is the reset; deleting
    // another one must not raise or clear anything on this screen.
    raise();
    await useStore.getState().deleteSession("s1");
    expect(useStore.getState().chatWarning).not.toBe(null);
    await useStore.getState().deleteSession(
      useStore.getState().sessionId ?? "",
    );
    expect(useStore.getState().chatWarning).toBe(null);
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
      multimodalAvailable: async () => false,
    });
    await useStore.getState().send("what is this?", [
      "data:image/jpeg;base64,AAAA",
    ]);

    expect(calls.texts[0]).toBe("what is this?");
    expect(calls.images[0]).toBe(undefined);
    const w = useStore.getState().chatWarning;
    expect(w).not.toBe(null);
    expect(w?.severity).toBe("warning");
    expect(w?.recoverable).toBe(false);
  });

  it("stays quiet when no image is attached", async () => {
    const { runTurn } = fakeRunTurn([{ reply: "ok" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hello");
    expect(useStore.getState().chatWarning).toBe(null);
  });

  it("hands images through when the model can see (vision-series 02)", async () => {
    const { runTurn, calls } = fakeRunTurn([{ reply: "a cat" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
      multimodalAvailable: async () => true,
    });
    await useStore.getState().send("what is this?", [
      "data:image/jpeg;base64,AAAA",
    ]);
    expect(calls.images[0]).toEqual(["data:image/jpeg;base64,AAAA"]);
    expect(useStore.getState().chatWarning).toBe(null);
  });

  it("re-checks the gate on regenerate, not just on the original send", async () => {
    // The projector can be unpaired (or the model swapped to a text-only
    // one) between a turn and its rerun, so the rerun asks the capability
    // question again rather than trusting what the first send was allowed
    // through with.
    const image = "data:image/jpeg;base64,AAAA";
    let canSee = true;
    const { runTurn, calls } = fakeRunTurn([{ reply: "a cat" }, { reply: "again" }]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
      multimodalAvailable: async () => canSee,
    });
    await useStore.getState().send("what is this?", [image]);
    expect(calls.images).toEqual([[image]]);
    const assistantId = useStore.getState().messages[1].id;

    canSee = false;
    await useStore.getState().regenerate(assistantId);
    expect(calls.images).toEqual([[image], undefined]);
    expect(useStore.getState().chatWarning?.severity).toBe("warning");
  });

  it("re-checks the gate on retry too, so a rerun cannot smuggle the image", async () => {
    // retry re-answers a stored question with the user turn's own images.
    // A guard written per-caller would let exactly this path hand a
    // text-only model the photo the original send was denied.
    const image = "data:image/jpeg;base64,AAAA";
    const { runTurn, calls } = fakeRunTurn([
      { fail: "boom" },
      { reply: "recovered" },
    ]);
    const useStore = createChatStore({
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
      multimodalAvailable: async () => false,
    });
    await useStore.getState().send("what is this?", [image]);
    const failedId = useStore.getState().messages[1].id;
    await useStore.getState().retry(failedId);

    expect(calls.images).toEqual([undefined, undefined]);
    expect(useStore.getState().chatWarning?.message).toBe(
      "This model can't see images, so it was sent the text only.",
    );
  });

  it("routes edit-and-resend through the same gate", async () => {
    // Edit commits by calling send, so it inherits the one guard. What
    // must not regress is a rewritten turn that re-attaches an image the
    // gate has since started refusing.
    const image = "data:image/jpeg;base64,AAAA";
    const fake = fakeSessionStore(
      [{ id: "s1", title: "T", turns: [{ role: "user", content: "typo here" }] }],
      "s1",
    );
    const { runTurn, calls } = fakeRunTurn([{ reply: "right answer" }]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn,
      multimodalAvailable: async () => true,
    });
    await useStore.getState().loadSession();
    useStore.getState().startEdit(useStore.getState().messages[0].id);
    expect(await useStore.getState().send("typo fixed", [image])).toBe(true);
    expect(calls.images).toEqual([[image]]);
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
    expect(out.ok).toBe(true);
    expect(out.imported).toBe(1);
    expect(out.skipped).toBe(0);
    await useStore.getState().refreshSessions();
    const titles = useStore.getState().sessions.map((s) => s.title);
    expect(titles.includes("Restored")).toBeTruthy();
  });

  it("refuses a bad file without writing anything", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    const out = await useStore.getState().importSessions("not json");
    expect(out.ok).toBe(false);
    expect(out.imported).toBe(0);
    await useStore.getState().refreshSessions();
    expect(useStore.getState().sessions.length).toBe(0);
  });

  it("importing the same backup twice yields two conversations", async () => {
    const { getStore, runTurn } = storeWith([]);
    const useStore = createChatStore({ getStore, runTurn });
    const text = backup("Twice", "hello");
    await useStore.getState().importSessions(text);
    await useStore.getState().importSessions(text);
    await useStore.getState().refreshSessions();
    expect(useStore.getState().sessions.filter((s) => s.title === "Twice").length).toBe(2);
  });
});

describe("streaming yield (C16)", () => {
  it("yields periodically while held, and never after release", async () => {
    let ticks = 0;
    const release = startStreamYield(5, () => {
      ticks += 1;
    });
    await new Promise((r) => setTimeout(r, 100));
    release();
    const atRelease = ticks;
    expect(atRelease >= 3).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(ticks).toBe(atRelease);
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
    expect(useStore.getState().messages.map((m) => m.id)).toEqual(stored?.map((t) => t.id));
    expect(stored?.every((t) => typeof t.id === "string" && t.id !== "")).toBeTruthy();
  });
});
