/** Screen wake-lock lifecycle (audit G2).
 * Run: node --test tests/chat-keep-awake.test.ts
 *
 * The lock is observable through the injected `keepAwake` seam, so these
 * run in plain Node with no native module. What they pin is the ORDER —
 * in particular that Stop releases immediately, and that a superseded
 * run does not stomp the lock the next turn just took. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createChatStore } from "../store/chat.ts";
import { createKeepAwake, type KeepAwake } from "../lib/chat/keep-awake.ts";
import { fakeRunTurn, fakeSessionStore, gatedRunTurn } from "./fakes.ts";

/** Records the keep-awake calls in order, so a test can assert the
 *  sequence rather than just the end state. */
function wakeLog() {
  const calls: boolean[] = [];
  return { calls, keepAwake: (on: boolean) => void calls.push(on) };
}

function storeWith(turn: ReturnType<typeof gatedRunTurn>, keepAwake: (on: boolean) => void) {
  const fake = fakeSessionStore([]);
  return createChatStore({
    getStore: async () => fake.store,
    runTurn: turn.runTurn,
    keepAwake,
  });
}

describe("chat wake lock", () => {
  it("holds the screen awake while a turn runs and releases when it settles", async () => {
    const turn = gatedRunTurn();
    const { calls, keepAwake } = wakeLog();
    const useStore = storeWith(turn, keepAwake);

    const sent = useStore.getState().send("hi");
    // Armed synchronously, before the turn has produced anything.
    assert.deepEqual(calls, [true], "lock taken when the turn starts");

    turn.release("Echo hi");
    await sent;
    assert.deepEqual(calls, [true, false], "released once the turn settles");
  });

  it("releases on a failed turn too", async () => {
    const fake = fakeSessionStore([]);
    const { calls, keepAwake } = wakeLog();
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: async () => {
        throw new Error("engine blew up");
      },
      keepAwake,
    });

    await useStore.getState().send("hi");
    assert.deepEqual(calls, [true, false], "a failed turn must not hold the screen");
  });

  it("releases on Stop before the aborted run unwinds", async () => {
    const turn = gatedRunTurn();
    const { calls, keepAwake } = wakeLog();
    const useStore = storeWith(turn, keepAwake);

    const sent = useStore.getState().send("hi");
    useStore.getState().stop();

    // Still only one call: the gated turn has NOT resolved yet. This is
    // the whole point of the early release — releasing in the run's own
    // unwind would leave the lock held through engine teardown.
    assert.deepEqual(calls, [true, false], "Stop drops the lock immediately");

    turn.release("late");
    await sent;
    // The superseded run must not touch the lock again.
    assert.deepEqual(calls, [true, false], "the unwinding run adds no release");
  });

  it("does not let a stopped run release the NEXT turn's lock", async () => {
    const first = gatedRunTurn();
    const second = gatedRunTurn();
    const { calls, keepAwake } = wakeLog();
    const fake = fakeSessionStore([]);

    let runTurn = first.runTurn;
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: (text, paths, onToken, onReasoning) =>
        runTurn(text, paths, onToken, onReasoning),
      keepAwake,
    });

    const sent1 = useStore.getState().send("one");
    useStore.getState().stop();

    // Point the store at the second gate BEFORE sending: runTurn is read
    // at call time, so reassigning afterwards would leave turn two parked
    // on the already-resolved first gate forever.
    runTurn = second.runTurn;
    const sent2 = useStore.getState().send("two");
    assert.deepEqual(calls, [true, false, true], "the new turn re-arms");

    // Now run #1 finally unwinds. It is stale (streamGen moved on), so
    // it must not release the lock run #2 is relying on.
    first.release("stale");
    await sent1;
    assert.equal(calls[calls.length - 1], true, "run #2 still holds the lock");

    second.release("Echo two");
    await sent2;
    assert.deepEqual(calls, [true, false, true, false]);
  });

  it("takes the lock for regenerate too", async () => {
    const turn = fakeRunTurn([{ reply: "answer" }]);
    const { calls, keepAwake } = wakeLog();
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: turn.runTurn,
      keepAwake,
    });

    // A finished assistant turn with a question before it.
    useStore.setState({
      messages: [
        { id: "u1", role: "user", text: "q", at: 1 },
        { id: "a1", role: "assistant", text: "a", at: 2 },
      ],
    });
    await useStore.getState().regenerate("a1");
    assert.deepEqual(calls, [true, false], "regenerate funnels through the same lock");
  });
});

// The cases above inject `keepAwake`, so they pin the STORE's ordering.
// These pin the MODULE's own logic — in particular the race that both
// code-review agents found: a release issued while the hold was still
// awaiting must cancel it, or the lock is stranded awake forever with
// nothing left to release it (the `gen` guard stops the aborted run from
// reaching its own release).

describe("keep-awake lock", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  /** Counts activations/releases and lets a test stall an activate. */
  function fakeModule() {
    const calls = { activate: 0, deactivate: 0 };
    const gate = deferred<void>();
    const mod = {
      activateKeepAwakeAsync: () => {
        calls.activate += 1;
        return gate.promise;
      },
      deactivateKeepAwake: () => {
        calls.deactivate += 1;
      },
    };
    return { calls, gate, mod: mod as unknown as KeepAwake };
  }

  /** Same counters, but activate settles immediately — for the cases
   *  that are about ordering, not about the activate window. */
  function autoModule() {
    const calls = { activate: 0, deactivate: 0 };
    const mod = {
      activateKeepAwakeAsync: async () => {
        calls.activate += 1;
      },
      deactivateKeepAwake: () => {
        calls.deactivate += 1;
      },
    };
    return { calls, mod: mod as unknown as KeepAwake };
  }

  it("holds and releases", async () => {
    const { gate, mod } = fakeModule();
    const lock = createKeepAwake(async () => mod);

    const held = lock.holdScreen();
    gate.resolve();
    await held;
    lock.releaseScreen();
  });

  it("activates exactly once across a hold and release", async () => {
    const { calls, gate, mod } = fakeModule();
    const lock = createKeepAwake(async () => mod);

    const held = lock.holdScreen();
    gate.resolve();
    await held;
    assert.equal(calls.activate, 1);

    lock.releaseScreen();
    assert.equal(calls.deactivate, 1);
  });

  it("cancels a hold released while the module was still loading", async () => {
    const { calls, gate, mod } = fakeModule();
    const load = deferred<KeepAwake>();
    const lock = createKeepAwake(() => load.promise);

    const held = lock.holdScreen();
    // Stop lands mid-load: nothing has activated yet.
    lock.releaseScreen();
    load.resolve(mod);
    gate.resolve();
    await held;

    // The whole point: it must never have activated, so there is nothing
    // left holding the screen awake.
    assert.equal(calls.activate, 0);
    assert.equal(calls.deactivate, 0);
  });

  it("undoes a hold released while it was activating", async () => {
    const { calls, gate, mod } = fakeModule();
    const lock = createKeepAwake(async () => mod);

    const held = lock.holdScreen();
    await Promise.resolve();
    await Promise.resolve();
    // Past the load await, now stalled inside activate.
    assert.equal(calls.activate, 1);
    lock.releaseScreen();
    gate.resolve();
    await held;

    // It DID activate, so the release must have taken it back down.
    assert.equal(calls.deactivate, 1);
  });

  it("does not re-activate when a second hold arrives while held", async () => {
    const { calls, gate, mod } = fakeModule();
    const lock = createKeepAwake(async () => mod);

    const first = lock.holdScreen();
    gate.resolve();
    await first;
    await lock.holdScreen();
    assert.equal(calls.activate, 1, "already held");
  });

  it("can be held again after a release", async () => {
    const { calls, mod } = autoModule();
    const lock = createKeepAwake(async () => mod);

    await lock.holdScreen();
    lock.releaseScreen();
    await lock.holdScreen();
    assert.equal(calls.activate, 2, "a new turn takes the lock again");
    assert.equal(calls.deactivate, 1);
  });

  it("survives a loader that rejects, and does not stay held", async () => {
    const { calls, mod } = autoModule();
    const lock = createKeepAwake(async () => {
      throw new Error("no native module");
    });

    await lock.holdScreen();
    assert.equal(calls.activate, 0);
    lock.releaseScreen();
    assert.equal(calls.deactivate, 0);

    // And a later hold retries rather than being permanently wedged.
    const ok = createKeepAwake(async () => mod);
    await ok.holdScreen();
    assert.equal(calls.activate, 1);
  });
});