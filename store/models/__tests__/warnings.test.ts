/** The tool-compat warned-set: once per model.
 *
 * The set is what makes the notice a warning rather than noise. It is
 * persisted — by the store's persist middleware, not by this slice — so a
 * model warned about last week is not warned about again today (PocketPal
 * parity: UIStore's `toolCompatWarnedModels`). The round-trip across a
 * restart is covered by the store-level persistence test.
 */

import { createWarningsSlice, parseWarnedModelIds } from "../warnings";
import type { ModelStore, WarningsSlice } from "../types";

/** A slice in isolation: the store is a composition, and this slice owns
 *  only its own set. */
function makeSlice() {
  const creator = createWarningsSlice();
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

describe("the tool-compat warned-set", () => {
  it("starts empty", () => {
    const slice = makeSlice();
    expect(slice.state.toolCompatWarnedModels).toEqual([]);
    expect(slice.state.hasWarnedToolCompat("model-a")).toBe(false);
  });

  it("records a model and reports it as warned", () => {
    const slice = makeSlice();

    slice.state.markToolCompatWarned("model-a");

    expect(slice.state.hasWarnedToolCompat("model-a")).toBe(true);
    expect(slice.state.hasWarnedToolCompat("model-b")).toBe(false);
  });

  it("does not record the same model twice", () => {
    const slice = makeSlice();

    slice.state.markToolCompatWarned("model-a");
    slice.state.markToolCompatWarned("model-a");

    expect(slice.state.toolCompatWarnedModels).toEqual(["model-a"]);
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
