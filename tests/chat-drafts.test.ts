/** Per-session composer drafts over the on-device store.
 * Run: node --test frontend/tests/chat-drafts.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createChatStore } from "../store/chat.ts";
import { draftKey } from "../lib/chat/drafts.ts";
import { fakeRunTurn, fakeSessionStore, memoryStorage } from "./fakes.ts";

function twoSessions() {
  const fake = fakeSessionStore([
    { id: "s1", title: "One" },
    { id: "s2", title: "Two" },
  ]);
  return {
    getStore: async () => fake.store,
    runTurn: fakeRunTurn([]).runTurn,
  };
}

describe("draftKey", () => {
  it("namespaces stored drafts per session", () => {
    assert.equal(draftKey("s1"), "liai_draft_s1");
  });

  it("parks the unsent conversation under a fixed new key", () => {
    assert.equal(draftKey(null), "liai_draft_new");
  });
});

describe("chat store drafts", () => {
  it("starts with an empty draft", async () => {
    const useStore = createChatStore(memoryStorage(), twoSessions());
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().draft, "");
  });

  it("persists the old draft and loads the new one on switch", async () => {
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage, twoSessions());
    await useStore.getState().loadSession();
    useStore.getState().setDraft("hello s1");
    assert.equal(await useStore.getState().switchSession("s2"), true);
    assert.equal(storage.data["liai_draft_s1"], "hello s1");
    assert.equal(useStore.getState().draft, "");
    useStore.getState().setDraft("hello s2");
    assert.equal(await useStore.getState().switchSession("s1"), true);
    assert.equal(useStore.getState().draft, "hello s1");
  });

  it("clears the draft and its stored key on send", async () => {
    const storage = memoryStorage({ liai_session_id: "s1" });
    const useStore = createChatStore(storage, twoSessions());
    await useStore.getState().loadSession();
    useStore.getState().setDraft("typed but sent");
    assert.equal(await useStore.getState().send("typed but sent"), true);
    assert.equal(useStore.getState().draft, "");
    assert.equal(storage.data["liai_draft_s1"], undefined);
  });

  it("restores the parked draft for a fresh conversation", async () => {
    const storage = memoryStorage({ liai_draft_new: "parked" });
    const fake = fakeSessionStore([]);
    const useStore = createChatStore(storage, {
      getStore: async () => fake.store,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().draft, "parked");
  });
});
