/** Superseded Hub searches must not win. Run: node --test tests/hf-search-race.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "zustand/vanilla";
import type { StateCreator } from "zustand";

import { createCatalogSlice } from "../store/models/catalog.ts";

interface SearchSlice {
  searchResults: { modelId: string }[];
  searchError: string | null;
  searchLoading: boolean;
  searchModels: (query: string) => Promise<void>;
}

// The slice is typed against the whole ModelStore but searchModels only
// touches search state, so a narrow stand-in is enough to drive it.
const makeStore = () =>
  createStore(createCatalogSlice as unknown as StateCreator<SearchSlice>);

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  (globalThis as Record<string, unknown>).fetch = impl;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("search race", () => {
  beforeEach(() => {
    mockFetch(async () => jsonResponse([]));
  });

  it("a superseded search never overwrites the newer results", async () => {
    const release: (() => void)[] = [];
    mockFetch(async (url) => {
      const query = new URL(String(url)).searchParams.get("search");
      if (query === "old") {
        // The stale request resolves LAST, the classic race.
        await new Promise<void>((resolve) => release.push(resolve));
      }
      return jsonResponse([{ modelId: `${query}/model`, downloads: 1 }]);
    });

    const store = makeStore();
    const stale = store.getState().searchModels("old");
    await store.getState().searchModels("new");
    release.forEach((fn) => fn());
    await stale;

    assert.deepEqual(
      store.getState().searchResults.map((r) => r.modelId),
      ["new/model"],
    );
    assert.equal(store.getState().searchError, null);
    assert.equal(store.getState().searchLoading, false);
  });

  it("an aborted search reports no error and leaves no spinner", async () => {
    mockFetch(async (url, init) => {
      const query = new URL(String(url)).searchParams.get("search");
      if (query === "old") {
        await new Promise<void>((resolve) => {
          init?.signal?.addEventListener("abort", () => resolve());
        });
        throw new Error("The operation was aborted");
      }
      return jsonResponse([{ modelId: "new/model" }]);
    });

    const store = makeStore();
    const stale = store.getState().searchModels("old");
    await store.getState().searchModels("new");
    await stale;

    assert.equal(store.getState().searchError, null, "an abort is not a failure");
  });

  it("clearing the query aborts and leaves nothing loading", async () => {
    mockFetch(async (_url, init) => {
      await new Promise<void>((resolve) => {
        init?.signal?.addEventListener("abort", () => resolve());
      });
      throw new Error("The operation was aborted");
    });

    const store = makeStore();
    const pending = store.getState().searchModels("qwen");
    await store.getState().searchModels("");
    await pending;

    assert.deepEqual(store.getState().searchResults, []);
    assert.equal(store.getState().searchError, null);
    assert.equal(store.getState().searchLoading, false, "spinner must not stick");
  });
});
