/** Companion repository: merge-patch semantics, corrupt-row tolerance. */

import { createStore } from "tinybase";

import { TinyBaseCompanionRepository } from "@/services/companions/tinybase-repo.ts";
import type { Companion } from "@/types/companion.ts";

function newRepo(): { repo: TinyBaseCompanionRepository; tiny: ReturnType<typeof createStore> } {
  const tiny = createStore();
  return { repo: new TinyBaseCompanionRepository(tiny), tiny };
}

const BASE: Omit<Companion, "id" | "created_at" | "updated_at"> = {
  type: "local",
  name: "Test Companion",
  systemPrompt: "You are a test.",
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  source: "local",
};

it("creates, lists and reads back a companion", async () => {
  const { repo } = newRepo();
  const created = await repo.create(BASE);
  expect(created.id).toBeTruthy();
  expect(created.created_at).toBeTruthy();
  expect(await repo.get(created.id)).toEqual(created);
  expect(await repo.list()).toEqual([created]);
});

it("finds a companion by name", async () => {
  const { repo } = newRepo();
  await repo.create(BASE);
  const found = await repo.getByName("Test Companion");
  expect(found?.name).toEqual("Test Companion");
  expect(await repo.getByName("Nobody")).toEqual(null);
});

it("merge-patches: undefined leaves, null erases", async () => {
  const { repo } = newRepo();
  const created = await repo.create({
    ...BASE,
    greeting: { text: "hi" },
    description: "first",
  });
  // undefined MUST leave the stored value alone — the bug the
  // per-field gate exists to prevent.
  const patched = await repo.update(created.id, { description: undefined });
  expect(patched.description).toEqual("first");
  const cleared = await repo.update(created.id, { greeting: null });
  expect("greeting" in cleared).toEqual(false);
  // ...and the sibling fields stayed.
  expect(cleared.systemPrompt).toEqual(BASE.systemPrompt);
});

it("refuses to patch a companion that does not exist", async () => {
  const { repo } = newRepo();
  await expect(repo.update("missing", { name: "x" })).rejects.toThrow();
});

it("removes and reports whether anything was there", async () => {
  const { repo } = newRepo();
  const created = await repo.create(BASE);
  expect(await repo.remove(created.id)).toEqual(true);
  expect(await repo.remove(created.id)).toEqual(false);
  expect(await repo.list()).toEqual([]);
});

it("skips a corrupt row instead of crashing the grid", async () => {
  const { repo, tiny } = newRepo();
  tiny.setCell("companions", "bad", "data", "not json");
  tiny.setCell("companions", "nameless", "data", JSON.stringify({ systemPrompt: "x" }));
  const created = await repo.create(BASE);
  const list = await repo.list();
  expect(list.map((p) => p.id)).toEqual([created.id]);
});
