/** The auto-release record: remember the model we freed, warm it on the
 * next launch.
 *
 * The background release in `offload.ts` frees a multi-GB GGUF when the app
 * goes to the background. Without a record of that, the next launch starts
 * cold and the first message pays for the whole load. These lock the
 * rules PocketPal's `checkAndReloadAutoReleasedModel` (ModelStore.ts:1148)
 * encodes: only the ACTIVE model can be warmed, the flag is cleared once
 * the model is back, a load that FAILED keeps the flag for the next
 * attempt, and a failed load must not keep the app shut.
 */

import {
  clearAutoReleased,
  decideAutoRelease,
  markAutoReleased,
  restoreAutoReleasedModel,
  type AutoReleaseActive,
  type AutoReleaseDeps,
} from "../auto-release";

/** A fake world: a persisted flag, an active model, and a reload counter. */
function world(overrides: Partial<AutoReleaseDeps> = {}) {
  const state = {
    releasedModelId: null as string | null,
    active: {
      modelId: "m1",
      providerType: "local" as "local" | "remote" | null,
      downloaded: true,
    } as AutoReleaseActive,
    reloads: 0,
  };
  const base: AutoReleaseDeps = {
    readReleasedModelId: async () => state.releasedModelId,
    writeReleasedModelId: async (id) => {
      state.releasedModelId = id;
    },
    readActive: async () => state.active,
    reloadEngine: async () => {
      state.reloads += 1;
    },
  };
  return { state, deps: { ...base, ...overrides } };
}

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("decideAutoRelease", () => {
  it("does nothing when nothing was auto-released", () => {
    expect(
      decideAutoRelease({
        releasedModelId: null,
        active: { modelId: "m1", providerType: "local", downloaded: true },
      }),
    ).toEqual("none");
  });

  it("reloads when the flag names the active local model", () => {
    expect(
      decideAutoRelease({
        releasedModelId: "m1",
        active: { modelId: "m1", providerType: "local", downloaded: true },
      }),
    ).toEqual("reload");
  });

  it("clears when the flag names a model that is no longer active", () => {
    // The engine holds ONE slot, keyed on the active model: reloading any
    // other id would load the wrong file.
    expect(
      decideAutoRelease({
        releasedModelId: "m1",
        active: { modelId: "m2", providerType: "local", downloaded: true },
      }),
    ).toEqual("clear");
  });

  it("clears for a remote provider — there is no local engine to restore", () => {
    expect(
      decideAutoRelease({
        releasedModelId: "m1",
        active: { modelId: "m1", providerType: "remote", downloaded: true },
      }),
    ).toEqual("clear");
  });

  it("clears when the file is gone", () => {
    expect(
      decideAutoRelease({
        releasedModelId: "m1",
        active: { modelId: "m1", providerType: "local", downloaded: false },
      }),
    ).toEqual("clear");
  });
});

describe("markAutoReleased", () => {
  it("records the active local model", async () => {
    const { state, deps } = world();

    await markAutoReleased(deps);

    expect(state.releasedModelId).toEqual("m1");
  });

  it("records nothing for a remote provider", async () => {
    const { state, deps } = world();
    state.active = {
      modelId: "m1",
      providerType: "remote",
      downloaded: true,
    };

    await markAutoReleased(deps);

    expect(state.releasedModelId).toBeNull();
  });

  it("records nothing when no model is active", async () => {
    const { state, deps } = world();
    state.active = { modelId: null, providerType: null, downloaded: false };

    await markAutoReleased(deps);

    expect(state.releasedModelId).toBeNull();
  });

  it("gives up on a write that never lands, so the engine is still freed", async () => {
    // The record has to reach the disk before the process can be killed, but
    // the free is what keeps a multi-GB model from being a memory problem in
    // the background. A storage that never answers must not hold the model.
    const { deps } = world({
      writeReleasedModelId: () => new Promise<void>(() => {}),
    });

    await expect(markAutoReleased(deps, 10)).resolves.toBeUndefined();
  });

  it("never rejects when the write fails", async () => {
    const { deps } = world({
      writeReleasedModelId: async () => {
        throw new Error("storage unavailable");
      },
    });

    await expect(markAutoReleased(deps)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("clearAutoReleased", () => {
  it("drops the flag", async () => {
    const { state, deps } = world();
    state.releasedModelId = "m1";

    await clearAutoReleased(deps);

    expect(state.releasedModelId).toBeNull();
  });

  it("never rejects when the write fails", async () => {
    const { deps } = world({
      writeReleasedModelId: async () => {
        throw new Error("storage unavailable");
      },
    });

    await expect(clearAutoReleased(deps)).resolves.toBeUndefined();
  });
});

describe("restoreAutoReleasedModel", () => {
  it("does nothing when there is no flag", async () => {
    const { state, deps } = world();

    await restoreAutoReleasedModel(deps);

    expect(state.reloads).toEqual(0);
    expect(state.releasedModelId).toBeNull();
  });

  it("warms the model up and then clears the flag", async () => {
    const { state, deps } = world();
    state.releasedModelId = "m1";

    await restoreAutoReleasedModel(deps);

    expect(state.reloads).toEqual(1);
    expect(state.releasedModelId).toBeNull();
  });

  it("clears the flag WITHOUT loading when the model is no longer active", async () => {
    const { state, deps } = world();
    state.releasedModelId = "m1";
    state.active = { modelId: "m2", providerType: "local", downloaded: true };

    await restoreAutoReleasedModel(deps);

    expect(state.reloads).toEqual(0);
    expect(state.releasedModelId).toBeNull();
  });

  it("clears the flag WITHOUT loading for a remote provider", async () => {
    const { state, deps } = world();
    state.releasedModelId = "m1";
    state.active = { modelId: "m1", providerType: "remote", downloaded: true };

    await restoreAutoReleasedModel(deps);

    expect(state.reloads).toEqual(0);
    expect(state.releasedModelId).toBeNull();
  });

  it("never rejects when the load fails, and KEEPS the flag for the next try", async () => {
    // PocketPal's `clearAutoReleaseFlags()` sits AFTER the load
    // (ModelStore.ts:1148), so a throw skips it. The failure may be
    // transient — a locked file, a busy GPU — and the next launch gets
    // another try.
    const { state, deps } = world({
      reloadEngine: async () => {
        throw new Error("out of memory");
      },
    });
    state.releasedModelId = "m1";

    await expect(restoreAutoReleasedModel(deps)).resolves.toBeUndefined();

    expect(state.releasedModelId).toEqual("m1");
  });

  it("never rejects when the flag cannot even be read", async () => {
    const { deps } = world({
      readReleasedModelId: async () => {
        throw new Error("storage unavailable");
      },
    });

    await expect(restoreAutoReleasedModel(deps)).resolves.toBeUndefined();
  });

  it("gives up on a load that never settles, so the app still opens", async () => {
    const { state, deps } = world({
      reloadEngine: () => new Promise<void>(() => {}),
    });
    state.releasedModelId = "m1";

    await restoreAutoReleasedModel(deps, 10);

    // The app opened without the model: the next launch must not hold the
    // splash for the same wait again.
    expect(state.releasedModelId).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
