/** Companions store: CRUD list-keeping and the once-only Pip seeding contract.
 *
 * Pure node: the store takes its repo and storage by injection, and the
 * repo is the real TinyBase one over a bare store — so the seed path is
 * exercised exactly as production runs it, minus expo-sqlite.
 */

import { createStore } from "tinybase";

import { createCompanionsStore, COMPANIONS_PIP_SEEDED_KEY } from "@/store/companions.ts";
import { TinyBaseCompanionRepository } from "@/services/companions/tinybase-repo.ts";
import { PIP_COMPANION } from "@/services/companions/builtins.ts";
import type { KeyValueStorage } from "@/services/storage/storage.ts";

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

function harness() {
  const repo = new TinyBaseCompanionRepository(createStore());
  const storage = fakeStorage();
  const store = createCompanionsStore(async () => repo, storage);
  return { store, repo, storage };
}

it("seeds Pip once, with all five talents", async () => {
  const { store, storage } = harness();
  expect(await store.getState().load()).toEqual(true);
  const seeded = store.getState().companions.find((p) => p.name === "Pip");
  expect(seeded).toBeTruthy();
  expect(seeded?.pact?.talents.map((t) => t.name)).toEqual([
    "datetime",
    "calculate",
    "web_search",
    "read_url",
    "render_html",
  ]);
  expect(storage.data.get(COMPANIONS_PIP_SEEDED_KEY)).toEqual("true");
});

it("keeps a user's Pip rename across restarts (shared repo + storage)", async () => {
  const repo = new TinyBaseCompanionRepository(createStore());
  const storage = fakeStorage();
  const first = createCompanionsStore(async () => repo, storage);
  await first.getState().load();
  const pip = first.getState().companions.find((p) => p.name === "Pip");
  expect(pip).toBeTruthy();
  await first.getState().updateCompanion(pip!.id, { name: "Pip renamed" });
  // Restart: NEW store instance, same storage AND same repo.
  const second = createCompanionsStore(async () => repo, storage);
  await second.getState().load();
  expect(second.getState().companions.map((p) => p.name)).toEqual(["Pip renamed"]);
});

it("never resurrects a deleted Pip once the flag is recorded", async () => {
  const repo = new TinyBaseCompanionRepository(createStore());
  const storage = fakeStorage();
  const first = createCompanionsStore(async () => repo, storage);
  await first.getState().load();
  const pip = first.getState().companions.find((p) => p.name === "Pip");
  await first.getState().deleteCompanion(pip!.id);
  // Restart with the same repo+storage: the flag says seeded, so the
  // deleted Pip stays deleted.
  const second = createCompanionsStore(async () => repo, storage);
  await second.getState().load();
  expect(second.getState().companions).toEqual([]);
});

it("lists, patches and deletes through the store", async () => {
  const { store } = harness();
  await store.getState().load();
  const created = await store.getState().createCompanion({
    ...PIP_COMPANION,
    name: "Roleplay",
  });
  expect(created).toBeTruthy();
  expect(store.getState().companions.some((p) => p.name === "Roleplay")).toEqual(true);
  const patched = await store.getState().updateCompanion(created!.id, {
    description: "edited",
  });
  expect(patched?.description).toEqual("edited");
  expect(await store.getState().deleteCompanion(created!.id)).toEqual(true);
  expect(store.getState().companions.some((p) => p.name === "Roleplay")).toEqual(false);
});

it("reports false when storage is unavailable", async () => {
  const store = createCompanionsStore(async () => null, fakeStorage());
  expect(await store.getState().load()).toEqual(false);
  expect(store.getState().loaded).toEqual(true);
});
