/** The tool-compat warned-set: once per model, and it survives a restart.
 *
 * The set is what makes the notice a warning rather than noise. It is
 * persisted, so a model warned about last week is not warned about again
 * today (PocketPal parity: UIStore's `toolCompatWarnedModels`).
 */

import { createWarningsSlice, parseWarnedModelIds } from "../warnings";
import { TOOL_COMPAT_WARNED_KEY } from "../storage";
import type { ModelStore, WarningsSlice } from "../types";
import type { KeyValueStorage } from "@/services/storage/storage";

/** A slice in isolation: the store is a composition, and this slice owns
 *  only its own set and its own key. */
function makeSlice(storage: KeyValueStorage) {
  const creator = createWarningsSlice(storage);
  let state: WarningsSlice = {} as WarningsSlice;
  const set = (partial: unknown) => {
    const patch =
      typeof partial === "function"
        ? (partial as (s: WarningsSlice) => unknown)(state)
        : partial;
    state = { ...state, ...(patch as Partial<WarningsSlice>) };
  };
  const get = () => state as unknown as ModelStore;
  state = creator(set as never, get as never, undefined as never);
  return {
    get state() {
      return state;
    },
  };
}

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  const storage: KeyValueStorage & { data: Record<string, string> } = {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
  return storage;
}

describe("the tool-compat warned-set", () => {
  it("starts empty", () => {
    const slice = makeSlice(memoryStorage());
    expect(slice.state.toolCompatWarnedModels).toEqual([]);
    expect(slice.state.hasWarnedToolCompat("model-a")).toBe(false);
  });

  it("records a model and reports it as warned", () => {
    const slice = makeSlice(memoryStorage());

    slice.state.markToolCompatWarned("model-a");

    expect(slice.state.hasWarnedToolCompat("model-a")).toBe(true);
    expect(slice.state.hasWarnedToolCompat("model-b")).toBe(false);
  });

  it("does not record the same model twice", () => {
    const slice = makeSlice(memoryStorage());

    slice.state.markToolCompatWarned("model-a");
    slice.state.markToolCompatWarned("model-a");

    expect(slice.state.toolCompatWarnedModels).toEqual(["model-a"]);
  });

  it("persists the set under its own key", async () => {
    const storage = memoryStorage();
    const slice = makeSlice(storage);

    slice.state.markToolCompatWarned("model-a");
    await Promise.resolve();
    await Promise.resolve();

    expect(JSON.parse(storage.data[TOOL_COMPAT_WARNED_KEY] ?? "[]")).toEqual([
      "model-a",
    ]);
  });

  it("reads a persisted set back", () => {
    expect(
      parseWarnedModelIds(JSON.stringify(["model-a", "model-b"])),
    ).toEqual(["model-a", "model-b"]);
  });

  it("ignores a corrupt payload instead of crashing", () => {
    expect(parseWarnedModelIds("{not json")).toEqual([]);
  });

  it("drops non-string entries from a persisted set", () => {
    expect(
      parseWarnedModelIds(JSON.stringify(["model-a", 42, null])),
    ).toEqual(["model-a"]);
  });

  it("treats a missing payload as an empty set", () => {
    expect(parseWarnedModelIds(null)).toEqual([]);
  });
});
