/** The first-run gate (Jest).
 *
 * Migrated to Zustand `persist` over AsyncStorage: the gate flag now lives
 * under ONBOARDING_KEY as `{ state: { onboarded }, version }`.
 */

import { createOnboardingStore, ONBOARDING_KEY } from "../onboarding";
import type { KeyValueStorage } from "@/services/storage/storage";

function fakeStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

function seed(storage: ReturnType<typeof fakeStorage>, onboarded: boolean) {
  storage.data.set(
    ONBOARDING_KEY,
    JSON.stringify({ state: { onboarded }, version: 0 }),
  );
}

describe("the first-run gate", () => {
  it("closes the gate for a user who has never onboarded", async () => {
    const storage = fakeStorage();
    const store = createOnboardingStore(storage);

    await store.getState().hydrate();

    expect(store.getState().onboarded).toBe(false);
    expect(store.getState().hydrated).toBe(true);
  });

  it("leaves the gate open for a returning user", async () => {
    const storage = fakeStorage();
    seed(storage, true);
    const store = createOnboardingStore(storage);

    await store.getState().hydrate();

    expect(store.getState().onboarded).toBe(true);
  });

  it("opens the gate and arms the destination when onboarding completes", async () => {
    const storage = fakeStorage();
    const store = createOnboardingStore(storage);
    await store.getState().hydrate();

    await store.getState().complete("/chat");

    expect(store.getState().onboarded).toBe(true);
    expect(store.getState().exitTo).toBe("/chat");
    const raw = storage.data.get(ONBOARDING_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.onboarded).toBe(true);
  });

  it("opens the gate even while the write is still in flight", async () => {
    let release: () => void = () => {};
    const storage: KeyValueStorage & { data: Map<string, string> } = {
      data: new Map(),
      getItem: async (key) => storage.data.get(key) ?? null,
      setItem: (key, value) =>
        new Promise<void>((resolve) => {
          release = () => {
            storage.data.set(key, value);
            resolve();
          };
        }),
      removeItem: async (key) => {
        storage.data.delete(key);
      },
    };
    const store = createOnboardingStore(storage);
    await store.getState().hydrate();

    const completing = store.getState().complete("/chat");
    expect(store.getState().onboarded).toBe(true);
    expect(store.getState().exitTo).toBe("/chat");

    release();
    await completing;
  });

  it("never rejects when the write fails", async () => {
    const storage: KeyValueStorage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("storage full");
      },
      removeItem: async () => {},
    };
    const store = createOnboardingStore(storage);
    await store.getState().hydrate();

    await expect(store.getState().complete("/chat")).resolves.toBeUndefined();
    expect(store.getState().onboarded).toBe(true);
  });

  it("forgets the destination once it has been navigated to", async () => {
    const storage = fakeStorage();
    const store = createOnboardingStore(storage);

    await store.getState().complete("/models");
    store.getState().clearExit();

    expect(store.getState().exitTo).toBeNull();
  });

  it("a read that lands after a completion does not close the gate again", async () => {
    let firstRead = true;
    let release: (value: string | null) => void = () => {};
    const storage: KeyValueStorage = {
      getItem: (key) => {
        if (firstRead) {
          firstRead = false;
          return new Promise<string | null>((resolve) => {
            release = resolve;
          });
        }
        return Promise.resolve(null);
      },
      setItem: async () => {},
      removeItem: async () => {},
    };
    const store = createOnboardingStore(storage);

    const hydrating = store.getState().hydrate();
    await store.getState().complete("/chat");
    release(null);
    await hydrating;

    expect(store.getState().onboarded).toBe(true);
    expect(store.getState().exitTo).toBe("/chat");
  });

  it("shares one read between concurrent hydrations", async () => {
    const storage = fakeStorage();
    const store = createOnboardingStore(storage);

    await Promise.all([
      store.getState().hydrate(),
      store.getState().hydrate(),
      store.getState().hydrate(),
    ]);

    expect(store.getState().hydrated).toBe(true);
  });
});
