/** Chat store tests (local Store sessions + on-device turns).
 * Run: node --test tests/chat-store.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
