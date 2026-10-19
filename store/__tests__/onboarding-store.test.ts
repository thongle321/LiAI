/** The first-run gate (Jest).
 *
 * The bug: `setOnboarded()` only wrote AsyncStorage, so the root layout's
 * `Stack.Protected` guard never reopened and the done screen's buttons
 * navigated to a route the navigator did not have — dropped, silently.
 *
 * These pin the two halves of the fix: the gate can re-open, and a read
 * that lands after a completion cannot close it again.
 */

import { createOnboardingStore, type OnboardingFlag } from "../onboarding";

/** A flag stand-in: the value the storage holds, and how often it was
 *  written. No device involved. */
function fakeFlag(initial = false) {
  const state = { value: initial, writes: 0 };
  const flag: OnboardingFlag = {
    read: async () => state.value,
    write: async () => {
      state.value = true;
      state.writes += 1;
    },
  };
  return { flag, state };
}

describe("the first-run gate", () => {
  it("closes the gate for a user who has never onboarded", async () => {
    const { flag } = fakeFlag(false);
    const store = createOnboardingStore(flag);

    await store.getState().hydrate();

    expect(store.getState().onboarded).toBe(false);
    expect(store.getState().hydrated).toBe(true);
  });

  it("leaves the gate open for a returning user", async () => {
    const { flag } = fakeFlag(true);
    const store = createOnboardingStore(flag);

    await store.getState().hydrate();

    expect(store.getState().onboarded).toBe(true);
  });

  it("opens the gate and arms the destination when onboarding completes", async () => {
    const { flag, state } = fakeFlag(false);
    const store = createOnboardingStore(flag);
    await store.getState().hydrate();

    await store.getState().complete("/chat");

    expect(store.getState().onboarded).toBe(true);
    expect(store.getState().exitTo).toBe("/chat");
    // The flag has to reach storage, or the next launch starts over.
    expect(state.writes).toBe(1);
  });

  it("opens the gate even while the write is still in flight", async () => {
    // The write is a disk round-trip and is deliberately OFF the critical
    // path: a stalled AsyncStorage must not leave the button looking dead.
    let release: () => void = () => {};
    const flag: OnboardingFlag = {
      read: async () => false,
      write: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    };
    const store = createOnboardingStore(flag);
    await store.getState().hydrate();

    const completing = store.getState().complete("/chat");
    expect(store.getState().onboarded).toBe(true);
    expect(store.getState().exitTo).toBe("/chat");

    release();
    await completing;
  });

  it("never rejects when the write fails", async () => {
    // A failed write means onboarding shows once more on the next launch,
    // which is the worst case services/onboarding.ts already accepts. It
    // must not surface as an unhandled rejection at the button.
    const flag: OnboardingFlag = {
      read: async () => false,
      write: async () => {
        throw new Error("storage full");
      },
    };
    const store = createOnboardingStore(flag);
    await store.getState().hydrate();

    await expect(store.getState().complete("/chat")).resolves.toBeUndefined();
    expect(store.getState().onboarded).toBe(true);
  });

  it("forgets the destination once it has been navigated to", async () => {
    const { flag } = fakeFlag(false);
    const store = createOnboardingStore(flag);

    await store.getState().complete("/models");
    store.getState().clearExit();

    expect(store.getState().exitTo).toBeNull();
  });

  it("a read that lands after a completion does not close the gate again", async () => {
    // The race the fix has to survive: the read is in flight, the user
    // finishes onboarding, and the stale read arrives afterwards.
    let release: (value: boolean) => void = () => {};
    const flag: OnboardingFlag = {
      read: () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
      write: async () => {},
    };
    const store = createOnboardingStore(flag);

    const hydrating = store.getState().hydrate();
    await store.getState().complete("/chat");
    release(false);
    await hydrating;

    expect(store.getState().onboarded).toBe(true);
    expect(store.getState().exitTo).toBe("/chat");
  });

  it("shares one read between concurrent hydrations", async () => {
    let reads = 0;
    const flag: OnboardingFlag = {
      read: async () => {
        reads += 1;
        return true;
      },
      write: async () => {},
    };
    const store = createOnboardingStore(flag);

    await Promise.all([
      store.getState().hydrate(),
      store.getState().hydrate(),
      store.getState().hydrate(),
    ]);

    expect(reads).toBe(1);
  });
});
