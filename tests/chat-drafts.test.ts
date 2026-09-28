/** Per-session composer drafts, held in the local Store (ADR-0012).
 * Run: node --test tests/chat-drafts.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createChatStore } from "../store/chat.ts";
import { fakeRunTurn, fakeSessionStore } from "./fakes.ts";

/** Two sessions, with `active` already pointing at one of them. */
function twoSessions(active: string | null = null) {
  const fake = fakeSessionStore(
    [
      { id: "s1", title: "One" },
      { id: "s2", title: "Two" },
    ],
    active,
  );
  return {
    fake,
    getStore: async () => fake.store,
    runTurn: fakeRunTurn([]).runTurn,
  };
}

describe("chat store drafts", () => {
  it("starts with an empty draft", async () => {
    const useStore = createChatStore(twoSessions());
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().draft, "");
  });

  it("persists the old draft and loads the new one on switch", async () => {
    const { fake, getStore, runTurn } = twoSessions("s1");
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    useStore.getState().setDraft("hello s1");
    assert.equal(await useStore.getState().switchSession("s2"), true);
    assert.equal(await fake.store.getDraft("s1"), "hello s1");
    assert.equal(useStore.getState().draft, "");
    useStore.getState().setDraft("hello s2");
    assert.equal(await useStore.getState().switchSession("s1"), true);
    assert.equal(useStore.getState().draft, "hello s1");
  });

  it("clears the draft on send", async () => {
    const { fake, getStore, runTurn } = twoSessions("s1");
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    useStore.getState().setDraft("typed but sent");
    assert.equal(await useStore.getState().send("typed but sent"), true);
    assert.equal(useStore.getState().draft, "");
    assert.equal(await fake.store.getDraft("s1"), "");
  });

  it("restores the parked draft for a fresh conversation", async () => {
    const fake = fakeSessionStore([]);
    await fake.store.setDraft(null, "parked");
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: fakeRunTurn([]).runTurn,
    });
    await useStore.getState().loadSession();
    assert.equal(useStore.getState().draft, "parked");
  });

  it("keeps a deleted session's draft from coming back", async () => {
    const { getStore, runTurn } = twoSessions("s1");
    const useStore = createChatStore({ getStore, runTurn });
    await useStore.getState().loadSession();
    useStore.getState().setDraft("doomed");
    await useStore.getState().persistDraft();
    await useStore.getState().deleteSession("s1");
    assert.equal(await getStore().then((s) => s!.getDraft("s1")), "");
  });
});
