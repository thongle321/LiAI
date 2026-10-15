/** Search settings tests (Jest). */

import {
  DEFAULT_PROVIDER,
  DEFAULT_RESULT_COUNT,
  isSearchProviderId,
  parseResultCount,
  searchKeySS,
} from "../../lib/search-providers";
import { createSearchStore, SEARCH_KEY } from "../search";
import { memorySecure, memoryStorage } from "../../jest/storage";

describe("search providers lib", () => {
  it("keys namespace per provider, counts clamp", () => {
    expect(searchKeySS("tavily")).toBe("liai_search_key_tavily");
    expect(isSearchProviderId("brave")).toBe(true);
    expect(isSearchProviderId("exa")).toBe(false);
    expect(parseResultCount(99)).toBe(8);
    expect(parseResultCount(0)).toBe(1);
    expect(parseResultCount("x")).toBe(DEFAULT_RESULT_COUNT);
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
    expect(s.activeProviderId).toBe(DEFAULT_PROVIDER);
    expect(s.resultCount).toBe(DEFAULT_RESULT_COUNT);
    expect(s.hasConsented).toBe(false);
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
    expect(saved.activeProviderId).toBe("brave");
    expect(saved.hasConsented).toBe(true);
    expect(JSON.stringify(saved).includes("bv-secret")).toBe(false);
    expect(secure.data["liai_search_key_brave"]).toBe("bv-secret");

    await useStore.getState().clearProviderKey("brave");
    expect(secure.data["liai_search_key_brave"]).toBe(undefined);
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createSearchStore(memoryStorage({ [SEARCH_KEY]: "[bad" }), secure);
    await bad.getState().load();
    expect(bad.getState().activeProviderId).toBe(DEFAULT_PROVIDER);
  });
});
