/** Chat store tests (on-device: Supabase sessions + local turns).
 * Run: node --test frontend/tests/chat-store.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createChatStore, SESSION_KEY } from "../store/chat.ts";
import { draftKey } from "../lib/chat/drafts.ts";
import {
  fakeRunTurn,
  fakeSessionStore,
  gatedRunTurn,
  memoryStorage,
} from "./fakes.ts";

function storeWith(seeds: Parameters<typeof fakeSessionStore>[0]) {
  const fake = fakeSessionStore(seeds);
  return {
    ...fake,
    getStore: async () => fake.store,
  };
}

describe("chat store sessions", () => {
  it("loads the session list and history on loadSession", async () => {
    const { getStore } = storeWith([{ id: "s1", title: "Hi" }]);
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage, {
      getStore,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    const state = useStore.getState();
    assert.equal(state.sessionId, "s1");
    assert.deepEqual(
      state.sessions.map((s) => s.id),
      ["s1"],
    );
    assert.equal(state.sessions[0].title, "Hi");
  });

  it("starts empty when no session is stored, without minting", async () => {
    const fake = fakeSessionStore([]);
    const useStore = createChatStore(memoryStorage(), {
      getStore: async () => fake.store,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, null);
    assert.deepEqual(useStore.getState().messages, []);
    assert.equal(fake.calls.creates, 0);
  });

  it("keeps state when the store fails", async () => {
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }), {
      getStore: async () => {
        throw new Error("supabase down");
      },
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessionId, "s1");
    assert.deepEqual(useStore.getState().sessions, []);
  });

  it("drops the legacy on-device history index", async () => {
    const { getStore } = storeWith([{ id: "s1", title: "Hi" }]);
    const storage = memoryStorage({
      liai_session_id: "s1",
      liai_history_v1: JSON.stringify([{ id: "s1", title: "old", at: 1 }]),
    });
    const useStore = createChatStore(storage, {
      getStore,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(storage.data["liai_history_v1"], undefined);
  });

  it("switchSession loads history with steps and usage", async () => {
    const { getStore } = storeWith([
      { id: "s2", title: "T" },
      {
        id: "s2",
        title: "T",
        turns: [
          { role: "user", content: "time?", type: "text" },
          {
            role: "assistant",
            content: "It is noon",
            type: "text",
            metadata: {
              tool_calls: ["get_current_time"],
              usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
            },
          },
        ],
      },
    ]);
    const storage = memoryStorage();
    const useStore = createChatStore(storage, {
      getStore,
      runTurn: fakeRunTurn([]).runTurn,
    });
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
      { tool: "get_current_time", status: "done" },
    ]);
    assert.deepEqual(state.messages[1].usage, {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    assert.equal(storage.data[SESSION_KEY], "s2");
  });

  it("switchSession prefers persisted tool_runs over bare names", async () => {
    const { getStore } = storeWith([
      {
        id: "s2",
        title: "T",
        turns: [
          { role: "user", content: "search?", type: "text" },
          {
            role: "assistant",
            content: "Found it",
            type: "text",
            metadata: {
              tool_calls: ["web_search"],
              tool_runs: [{ name: "web_search", input: { query: "q" }, result: "R" }],
            },
          },
        ],
      },
    ]);
    const useStore = createChatStore(memoryStorage(), {
      getStore,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().switchSession("s2"), true);
    assert.deepEqual(useStore.getState().messages[1].steps, [
      {
        tool: "web_search",
        status: "done",
        input: { query: "q" },
        result: "R",
      },
    ]);
  });

  it("renameSession patches the store and updates the row", async () => {
    const { getStore } = storeWith([{ id: "s1", title: "Hi" }]);
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }), {
      getStore,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(await useStore.getState().renameSession("s1", "New"), true);
    assert.equal(useStore.getState().sessions[0].title, "New");
  });

  it("renameSession returns false when the store rejects", async () => {
    const fake = fakeSessionStore([{ id: "s1", title: "Hi" }]);
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }), {
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
    const { getStore } = storeWith([{ id: "s1", title: "Hi" }]);
    const useStore = createChatStore(memoryStorage({ liai_session_id: "s1" }), {
      getStore,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().sessions[0].pinned, false);
    assert.equal(await useStore.getState().setPinned("s1", true), true);
    assert.equal(useStore.getState().sessions[0].pinned, true);
  });

  it("deleteSession removes the session and clears the active view", async () => {
    const fake = fakeSessionStore([{ id: "s1", title: "Hi" }]);
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage, {
      getStore: async () => fake.store,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    await useStore.getState().deleteSession("s1");
    assert.deepEqual(fake.calls.deletes, ["s1"]);
    const state = useStore.getState();
    assert.deepEqual(state.sessions, []);
    assert.equal(state.sessionId, null);
    assert.equal(storage.data[SESSION_KEY], undefined);
  });

  it("newConversation clears the view without touching the store", async () => {
    const fake = fakeSessionStore([{ id: "s1", title: "Hi" }]);
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage, {
      getStore: async () => fake.store,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    await useStore.getState().newConversation();
    const state = useStore.getState();
    assert.equal(state.sessionId, null);
    assert.deepEqual(state.messages, []);
    assert.equal(fake.calls.creates, 0);
    assert.equal(fake.calls.appends.length, 0);
  });
});

describe("chat store turns", () => {
  it("streams tokens into a pending bubble, then finalizes", async () => {
    const gate = gatedRunTurn();
    const storage = memoryStorage();
    const useStore = createChatStore(storage, {
      getStore: async () => fakeSessionStore([]).store,
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
    assert.equal(storage.data[SESSION_KEY], "s-new");
    assert.equal(state.draft, "");
    assert.equal(storage.data[draftKey(null)], undefined);
  });

  it("renders outcome steps as done chips", async () => {
    const { runTurn } = fakeRunTurn([
      {
        reply: "done",
        steps: [
          {
            id: "w1",
            tool: "web_search",
            status: "done",
            input: { query: "q" },
            result: "R",
          },
        ],
      },
    ]);
    const useStore = createChatStore(memoryStorage(), {
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("search?");
    assert.deepEqual(useStore.getState().messages[1].steps, [
      {
        id: "w1",
        tool: "web_search",
        status: "done",
        input: { query: "q" },
        result: "R",
      },
    ]);
  });

  it("marks the bubble when the runner fails", async () => {
    const { runTurn } = fakeRunTurn([{ fail: "boom" }]);
    const useStore = createChatStore(memoryStorage(), {
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
    const useStore = createChatStore(memoryStorage(), {
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
    const useStore = createChatStore(memoryStorage(), {
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    await useStore.getState().send("hi");
    assert.equal(await useStore.getState().retry(useStore.getState().messages[0].id), false);
    assert.deepEqual(calls.texts, ["hi"]);
  });

  it("regenerate replaces a completed reply and pops the stored turn", async () => {
    const fake = fakeSessionStore([
      {
        id: "s1",
        title: "T",
        turns: [
          { role: "user", content: "hi", type: "text" },
          { role: "assistant", content: "first", type: "text" },
        ],
      },
    ]);
    const { runTurn, calls } = fakeRunTurn([{ reply: "second" }]);
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage, {
      getStore: async () => fake.store,
      runTurn,
    });
    await useStore.getState().loadSession();
    const assistantId = useStore.getState().messages[1].id;
    await useStore.getState().regenerate(assistantId);
    assert.deepEqual(calls.texts, ["hi"]);
    assert.equal(useStore.getState().messages[1].text, "second");
    // The store level pops the stale turn; the re-append is the turn
    // builder's tested job (the fake runner bypasses it by design).
    const stored = await fake.store.get("s1");
    assert.deepEqual(
      stored?.map((t) => t.content),
      ["hi"],
    );
  });

  it("blocked sends return false and change nothing", async () => {
    const { runTurn, calls } = fakeRunTurn([]);
    const useStore = createChatStore(memoryStorage(), {
      getStore: async () => fakeSessionStore([]).store,
      runTurn,
    });
    assert.equal(await useStore.getState().send("   "), false);
    assert.deepEqual(useStore.getState().messages, []);
    assert.deepEqual(calls.texts, []);
  });

  it("ignores a second send while a turn is in flight", async () => {
    const gate = gatedRunTurn();
    const useStore = createChatStore(memoryStorage(), {
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
    const up = createChatStore(memoryStorage(), {
      getStore: async () => fakeSessionStore([]).store,
      runTurn: fakeRunTurn([]).runTurn,
      getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }),
    });
    await up.getState().checkHealth();
    assert.equal(up.getState().connection, "up");
    const down = createChatStore(memoryStorage(), {
      getStore: async () => fakeSessionStore([]).store,
      runTurn: fakeRunTurn([]).runTurn,
      getEngineSource: async () => null,
    });
    await down.getState().checkHealth();
    assert.equal(down.getState().connection, "down");
  });

});
