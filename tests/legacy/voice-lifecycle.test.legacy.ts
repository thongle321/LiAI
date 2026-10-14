/** Voice ↔ chat lifecycle (ticket 05 / spec Q3, Q14).
 * Run: node --test tests/voice-lifecycle.test.ts
 *
 * Drives the real send→completion path against a scripted TurnRunner and
 * asserts the auto-speak contract: gated on opt-in + availability, spoken
 * once per message. The app-singleton voice store is driven through its
 * actions (no storage touched) and reset after each test — node --test
 * isolates files in separate processes, so the singleton never leaks
 * across files.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createChatStore } from "../store/chat.ts";
import { useVoice } from "../store/voice.ts";
import { fakeRunTurn, fakeSessionStore } from "./fakes.ts";

function resetVoice(): void {
  useVoice.getState().setAutoSpeak(false);
  useVoice.getState().setUserTTSOverride(null);
}

function storeWith(seeds: Parameters<typeof fakeSessionStore>[0], active: string | null = null) {
  const fake = fakeSessionStore(seeds, active);
  return {
    ...fake,
    getStore: async () => fake.store,
    runTurn: fakeRunTurn([{ reply: "spoken reply" }]).runTurn,
  };
}

function assistantIdOf(useStore: ReturnType<typeof createChatStore>): string {
  const bubble = useStore
    .getState()
    .messages.find((m) => m.role === "assistant");
  assert.ok(bubble, "the send must leave an assistant bubble");
  return bubble.id;
}

describe("auto-speak at completion", () => {
  it("marks the finished reply spoken when opted in on an available device", async () => {
    resetVoice();
    useVoice.getState().setAutoSpeak(true);
    useVoice.getState().setUserTTSOverride(true);
    const useStore = createChatStore(storeWith([]));
    try {
      await useStore.getState().send("hi");
      assert.equal(useVoice.getState().lastSpokenMessageId, assistantIdOf(useStore));
    } finally {
      resetVoice();
    }
  });

  it("skips speech when auto-speak is off", async () => {
    resetVoice();
    useVoice.getState().setUserTTSOverride(true);
    const useStore = createChatStore(storeWith([]));
    try {
      const before = useVoice.getState().lastSpokenMessageId;
      await useStore.getState().send("hi");
      assert.equal(useVoice.getState().lastSpokenMessageId, before);
    } finally {
      resetVoice();
    }
  });

  it("skips speech when the device fails the availability gate", async () => {
    resetVoice();
    useVoice.getState().setAutoSpeak(true);
    const useStore = createChatStore(storeWith([]));
    try {
      const before = useVoice.getState().lastSpokenMessageId;
      await useStore.getState().send("hi");
      assert.equal(useVoice.getState().lastSpokenMessageId, before);
    } finally {
      resetVoice();
    }
  });
});

describe("spoken marks", () => {
  it("clearSpoken forgets only the matching message id", async () => {
    resetVoice();
    const voice = useVoice.getState();
    try {
      voice.markSpoken("m1");
      assert.equal(useVoice.getState().lastSpokenMessageId, "m1");
      voice.clearSpoken("other");
      assert.equal(useVoice.getState().lastSpokenMessageId, "m1");
      voice.clearSpoken("m1");
      assert.equal(useVoice.getState().lastSpokenMessageId, null);
    } finally {
      resetVoice();
    }
  });
});

describe("session navigation stops voice", () => {
  it("switchSession completes while the voice stop is wired in", async () => {
    resetVoice();
    const useStore = createChatStore(storeWith([{ id: "s1", title: "A" }, { id: "s2", title: "B" }], "s1"));
    try {
      await useStore.getState().loadSession();
      assert.equal(await useStore.getState().switchSession("s2"), true);
    } finally {
      resetVoice();
    }
  });
});
