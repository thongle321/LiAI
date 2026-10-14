const assert: any = {
  ok: (v: unknown, msg?: string) => expect(v).toBeTruthy(),
  equal: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  strictEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toBe(b),
  notEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  notDeepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  match: (value: string, re: RegExp | string, msg?: string) => expect(value).toMatch(re as any),
  doesNotMatch: (value: string, re: RegExp | string, msg?: string) => expect(value).not.toMatch(re as any),
  throws: (fn: () => void, re?: RegExp | string, msg?: string) => expect(fn).toThrow(re as any),
  doesNotThrow: (fn: () => void, msg?: string) => expect(fn).not.toThrow(),
  rejects: async (input: any, expected?: any, msg?: string) => {
    const p = typeof input === "function" ? input() : input;
    let err: unknown;
    try {
      await p;
    } catch (e) {
      err = e;
    }
    if (err === undefined) {
      throw new Error("Expected promise to reject, but it resolved");
    }
    if (expected === undefined) return;
    if (typeof expected === "function") {
      if (expected.prototype) {
        if (!(err instanceof expected)) {
          throw new Error(msg ?? "rejected value not instance of expected constructor");
        }
      } else if (!expected(err)) {
        throw new Error(msg ?? "rejected value did not satisfy validator");
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String((err as Error)?.message ?? err))) {
        throw new Error(msg ?? "rejected message did not match");
      }
    } else if (typeof expected === "string") {
      if (!String((err as Error)?.message ?? err).includes(expected)) {
        throw new Error(msg ?? "rejected message did not include expected text");
      }
    } else if (expected instanceof Error) {
      if (((err as Error)?.message ?? String(err)) !== expected.message) {
        throw new Error(msg ?? "rejected message did not match");
      }
    }
  },
};

/** Search settings tests. Run: node --test frontend/tests/search-settings.test.ts */


import {
  DEFAULT_PROVIDER,
  DEFAULT_RESULT_COUNT,
  isSearchProviderId,
  parseResultCount,
  searchKeySS,
} from "../../lib/search-providers";
import { createSearchStore, SEARCH_KEY, type SecureAdapter } from "../search";
import type { KeyValueStorage } from "../../lib/storage";

function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

function memorySecure(seed: Record<string, string> = {}): SecureAdapter & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

describe("search providers lib", () => {
  it("keys namespace per provider, counts clamp", () => {
    assert.equal(searchKeySS("tavily"), "liai_search_key_tavily");
    assert.equal(isSearchProviderId("brave"), true);
    assert.equal(isSearchProviderId("exa"), false);
    assert.equal(parseResultCount(99), 8);
    assert.equal(parseResultCount(0), 1);
    assert.equal(parseResultCount("x"), DEFAULT_RESULT_COUNT);
  });
});

describe("search store", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let secure: ReturnType<typeof memorySecure>;

  beforeEach(() => {
    storage = memoryStorage();
    secure = memorySecure();
  });

  it("defaults to Tavily, 5 results, no consent", async () => {
    const useStore = createSearchStore(storage, secure);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.activeProviderId, DEFAULT_PROVIDER);
    assert.equal(s.resultCount, DEFAULT_RESULT_COUNT);
    assert.equal(s.hasConsented, false);
  });

  it("persists prefs in KV, keys in secure storage", async () => {
    const useStore = createSearchStore(storage, secure);
    await useStore.getState().load();
    useStore.getState().setActiveProvider("brave");
    useStore.getState().setResultCount(3);
    useStore.getState().setConsented(true);
    await useStore.getState().setProviderKey("brave", "bv-secret");
    await new Promise((r) => setTimeout(r, 0));

    const saved = JSON.parse(storage.data[SEARCH_KEY]);
    assert.equal(saved.activeProviderId, "brave");
    assert.equal(saved.hasConsented, true);
    assert.ok(!JSON.stringify(saved).includes("bv-secret"));
    assert.equal(secure.data["liai_search_key_brave"], "bv-secret");

    await useStore.getState().clearProviderKey("brave");
    assert.equal(secure.data["liai_search_key_brave"], undefined);
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createSearchStore(memoryStorage({ [SEARCH_KEY]: "[bad" }), secure);
    await bad.getState().load();
    assert.equal(bad.getState().activeProviderId, DEFAULT_PROVIDER);
  });
});
