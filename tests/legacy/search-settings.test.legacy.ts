/** Search settings tests. Run: node --test frontend/tests/search-settings.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PROVIDER,
  DEFAULT_RESULT_COUNT,
  isSearchProviderId,
  parseResultCount,
  searchKeySS,
} from "../lib/search-providers.ts";
import { createSearchStore, SEARCH_KEY, type SecureAdapter } from "../store/search.ts";
import type { KeyValueStorage } from "../lib/storage.ts";

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
