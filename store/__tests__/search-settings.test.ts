/** Search settings tests (Jest). */

import {
  DEFAULT_PROVIDER,
  DEFAULT_RESULT_COUNT,
  isSearchProviderId,
  parseResultCount,
  searchKeySS,
} from "@/services/search/search-providers";
import { createSearchStore, SEARCH_KEY } from "../search";
import { memorySecure, memoryStorage } from "@/jest/storage";

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

    const saved = JSON.parse(storage.data[SEARCH_KEY]).state;
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

describe("search consent hydration (D3-5)", () => {
  /** Consent that was granted in an earlier session, on disk. */
  const CONSENTED = JSON.stringify({
    state: {
      activeProviderId: "brave",
      resultCount: 3,
      hasConsented: true,
    },
    version: 0,
  });

  it("reads persisted consent on a cold start", async () => {
    const useStore = createSearchStore(memoryStorage({ [SEARCH_KEY]: CONSENTED }), memorySecure());

    await useStore.getState().load();

    const s = useStore.getState();
    // The unhydrated default is hasConsented: false, which is what made
    // defaultSearchAuth report search as disabled on every cold start.
    expect(s.hasConsented).toBe(true);
    expect(s.activeProviderId).toBe("brave");
    expect(s.resultCount).toBe(3);
  });

  it("concurrent loaders share one read (single-flight)", async () => {
    const kv = memoryStorage({ [SEARCH_KEY]: CONSENTED });
    const useStore = createSearchStore(kv, memorySecure());

    await Promise.all([
      useStore.getState().load(),
      useStore.getState().load(),
      useStore.getState().load(),
    ]);

    expect(kv.reads.filter((k) => k === SEARCH_KEY)).toHaveLength(1);
  });

  it("a later load reads nothing and keeps live state", async () => {
    const kv = memoryStorage({ [SEARCH_KEY]: CONSENTED });
    const useStore = createSearchStore(kv, memorySecure());
    await useStore.getState().load();
    useStore.getState().setConsented(false);

    await useStore.getState().load();

    // The re-read must not resurrect consent the user revoked this session.
    expect(useStore.getState().hasConsented).toBe(false);
    expect(kv.reads.filter((k) => k === SEARCH_KEY)).toHaveLength(1);
  });
});
