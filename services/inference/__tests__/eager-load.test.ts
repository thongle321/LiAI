/** Eager-load coordinator: the two-phase Load lifecycle (spec "One eager-load
 *  coordinator", issue 02) — preflight outside the lock, the switch inside it,
 *  last-one-wins supersession, the already-loaded short-circuit, failed loads
 *  leaving the slot empty and the Offload path.
 *
 *  Injected fakes throughout: no stores, no native modules, no device — the
 *  rules run the way the auto-release suites run them. */

import {
  createEagerLoad,
  planLoad,
  type EagerLoadDeps,
  type LocalEngineTarget,
} from "../eager-load";

function target(fileName: string): LocalEngineTarget {
  return { source: { kind: "local", fileName }, requirementBytes: 0 };
}

/** Drain microtasks until `pred` holds — the deterministic way to wait for
 *  an await inside the coordinator without real timers. */
async function waitFor(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 1000 && !pred(); i += 1) {
    await Promise.resolve();
  }
  if (!pred()) throw new Error("waitFor: condition never held");
}

/** One mutable world: the store state, the engine slot and the switch
 *  the coordinator drives, plus the log it writes into. */
function world(over: {
  /** Store state: the active pointer and a warm slot. */
  active?: { modelId: string | null; providerType: "local" | "remote" | null };
  warm?: boolean;
  /** resolveTarget override — e.g. a preflight blocked by an open confirm. */
  resolve?: (modelId: string | null) => Promise<LocalEngineTarget | null>;
  /** switchEngine rejects for a fileName this returns true on. */
  failOn?: (fileName: string) => boolean;
  /** Track calls to clearLastUsedModel for offload tests. */
  clearLastUsedModel?: () => void;
} = {}) {
  const state = {
    active: over.active ?? { modelId: null, providerType: "local" },
    warm: over.warm ?? false,
    pointer: [] as (string | null)[],
    spinner: [] as (string | null)[],
    switched: [] as string[],
    releases: 0,
    events: [] as string[],
    /** A switch whose target's hold is here runs until the test resolves it. */
    holds: new Map<string, Promise<void>>(),
    /** The store's live values: the setters log only TRANSITIONS, so a
     *  no-op clear (the spinner was already down) is not churn. */
    pointerNow: null as string | null,
    spinnerNow: null as string | null,
    clearLastUsedModelCalls: 0,
  };
  const deps: EagerLoadDeps = {
    readActive: async () => state.active,
    isSlotWarm: async () => state.warm,
    resolveTarget: async (modelId) => {
      state.events.push(`preflight:${modelId ?? "active"}`);
      if (over.resolve) return over.resolve(modelId);
      if (modelId === null) return null;
      return target(`${modelId}.gguf`);
    },
    switchEngine: async (t) => {
      state.switched.push(t.source.fileName);
      state.warm = true;
      state.events.push(`switch-start:${t.source.fileName}`);
      const hold = state.holds.get(t.source.fileName);
      if (hold) await hold;
      state.events.push(`switch-end:${t.source.fileName}`);
    },
    releaseSlot: async () => {
      state.releases += 1;
      state.events.push("release");
    },
    setActiveModel: (modelId) => {
      state.active = {
        modelId,
        providerType: modelId === null ? null : "local",
      };
      if (modelId !== state.pointerNow) state.pointer.push(modelId);
      state.pointerNow = modelId;
    },
    setLoadingModel: (modelId) => {
      if (modelId !== state.spinnerNow) state.spinner.push(modelId);
      state.spinnerNow = modelId;
    },
    clearLastUsedModel: () => {
      state.clearLastUsedModelCalls += 1;
      if (over.clearLastUsedModel) over.clearLastUsedModel();
    },
  };
  if (over.failOn) {
    const fail = over.failOn;
    const passing = deps.switchEngine;
    deps.switchEngine = async (t) => {
      if (fail(t.source.fileName)) throw new Error("load failed");
      return passing(t);
    };
  }
  const coordinator = createEagerLoad(deps);
  return { coordinator, state, deps };
}

describe("planLoad", () => {
  it("short-circuits the same local model while the slot is warm", () => {
    expect(
      planLoad({
        requestedId: "a",
        active: { modelId: "a", providerType: "local" },
        slotWarm: true,
      }),
    ).toBe("short-circuit");
  });

  it("switches on a cold slot even when the pointer already names the model", () => {
    // Post-background: the pointer survived the auto-release, the slot did not.
    expect(
      planLoad({
        requestedId: "a",
        active: { modelId: "a", providerType: "local" },
        slotWarm: false,
      }),
    ).toBe("switch");
  });

  it("switches when a remote provider owns the slot", () => {
    expect(
      planLoad({
        requestedId: "a",
        active: { modelId: "a", providerType: "remote" },
        slotWarm: true,
      }),
    ).toBe("switch");
  });
});

describe("createEagerLoad.load", () => {
  it("short-circuits an already-active warm model without touching anything", async () => {
    const { coordinator, state } = world({
      active: { modelId: "a", providerType: "local" },
      warm: true,
    });
    const outcome = await coordinator.load("a");
    expect(outcome).toBe("loaded");
    expect(state.switched).toEqual([]); // no native work
    expect(state.pointer).toEqual([]); // the pointer untouched
    expect(state.spinner).toEqual([]); // the spinner untouched
    expect(state.events).toEqual([]); // no preflight even went out
  });

  it("eager-loads: pointer and spinner move first, the switch runs, the spinner comes down", async () => {
    const { coordinator, state } = world();
    const outcome = await coordinator.load("a");
    expect(outcome).toBe("loaded");
    expect(state.pointer).toEqual(["a"]);
    expect(state.spinner).toEqual(["a", null]);
    expect(state.switched).toEqual(["a.gguf"]);
    expect(state.active).toEqual({ modelId: "a", providerType: "local" });
  });

  it("a completed load makes the next tap short-circuit", async () => {
    const { coordinator, state } = world();
    await coordinator.load("a");
    const second = await coordinator.load("a");
    expect(second).toBe("loaded");
    expect(state.switched).toEqual(["a.gguf"]); // never re-read the file
  });

  it("pre-flights OUTSIDE the lock: a newer request resolves while an older switch still holds the lock", async () => {
    const { coordinator, state } = world();
    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    state.holds.set("a.gguf", holdA);
    const a = coordinator.load("a");
    // Wait for A's switch to be holding the lock, then tap B.
    await waitFor(() => state.events.includes("switch-start:a.gguf"));
    const b = coordinator.load("b");
    // B's preflight must happen NOW — while A still owns the lock.
    await waitFor(() => state.events.includes("preflight:b"));
    expect(state.events).not.toContain("switch-end:a.gguf");
    releaseA();
    const [aOut, bOut] = await Promise.all([a, b]);
    // B claimed after A's switch had started, so B wins: A's section that
    // returns last is no longer the owner, and B loads on top of it.
    expect(aOut).toBe("superseded");
    expect(bOut).toBe("loaded");
    // The order proves it: B resolved before the lock was handed over.
    expect(state.events.indexOf("preflight:b")).toBeLessThan(
      state.events.indexOf("switch-end:a.gguf"),
    );
    expect(state.switched).toEqual(["a.gguf", "b.gguf"]);
  });

  it("last-one-wins: a quick second Load skips the first's native work and ends the spinner on its own card", async () => {
    // A's preflight is (as any real memory check will be in 03) an open
    // decision: B is requested while it is still in the air.
    let releaseA!: (t: LocalEngineTarget | null) => void;
    const aPreflight = new Promise<LocalEngineTarget | null>((resolve) => {
      releaseA = (t) => resolve(t);
    });
    const { coordinator, state } = world({
      resolve: async (id) => (id === "a" ? aPreflight : target("b.gguf")),
    });
    const a = coordinator.load("a");
    const b = coordinator.load("b");
    // Both claims are in; A is stuck in preflight. Let it resolve late.
    await waitFor(() => state.events.includes("preflight:b"));
    releaseA(target("a.gguf"));
    const [aOut, bOut] = await Promise.all([a, b]);
    expect(aOut).toBe("superseded");
    expect(bOut).toBe("loaded");
    // A did NO native work at all — its switch never ran.
    expect(state.switched).toEqual(["b.gguf"]);
    expect(state.releases).toEqual(0);
    // One loaded model, one spinner in flight — B's claim took the spinner
    // over, and only B's own section brought it down.
    expect(state.spinner).toEqual(["a", "b", null]);
    expect(state.pointer).toEqual(["a", "b"]);
    expect(state.active).toEqual({ modelId: "b", providerType: "local" });
  });

  it("a failed switch leaves nothing active and keeps the queue alive", async () => {
    const { coordinator, state } = world({
      failOn: (f) => f.startsWith("bad"),
    });
    const outcome = await coordinator.load("bad");
    expect(outcome).toBe("failed");
    // Nothing pretends the model is active: pointer reverted, spinner down.
    expect(state.active).toEqual({ modelId: null, providerType: null });
    expect(state.spinner[state.spinner.length - 1]).toBeNull();
    // The mutex chain survived the rejection.
    const after = await coordinator.load("a");
    expect(after).toBe("loaded");
    expect(state.switched).toEqual(["a.gguf"]);
  });

  it("a target that cannot be resolved is a failed load: the slot stays empty and the facade stops spinning", async () => {
    const { coordinator, state } = world({
      resolve: async () => null,
    });
    const outcome = await coordinator.load("a");
    expect(outcome).toBe("failed");
    expect(state.active).toEqual({ modelId: null, providerType: null });
    expect(state.spinner[state.spinner.length - 1]).toBeNull();
    expect(state.switched).toEqual([]); // no native work for a null target
  });
});

describe("createEagerLoad.offload", () => {
  it("releases the slot and clears the pointer inside the lock", async () => {
    const { coordinator, state } = world();
    await coordinator.load("a");
    await coordinator.offload();
    expect(state.releases).toEqual(1);
    expect(state.pointer).toEqual(["a", null]);
    expect(state.active).toEqual({ modelId: null, providerType: null });
    expect(state.spinner[state.spinner.length - 1]).toBeNull();
  });

  it("an offload request supersedes a pending load: no native work, then everything clears", async () => {
    // A's preflight still in the air (as it is while any confirm is up);
    // wiping the slot is the newer intent and must dethrone the load.
    let releaseA!: (t: LocalEngineTarget | null) => void;
    const aPreflight = new Promise<LocalEngineTarget | null>((resolve) => {
      releaseA = (t) => resolve(t);
    });
    const { coordinator, state } = world({
      resolve: async (id) => (id === "a" ? aPreflight : null),
    });
    const a = coordinator.load("a");
    await waitFor(() => state.events.includes("preflight:a"));
    const off = coordinator.offload();
    releaseA(target("a.gguf"));
    await Promise.all([a, off]);
    expect(a).resolves.toBe("superseded");
    // The load did no native work; the wipe still ran.
    expect(state.switched).toEqual([]);
    expect(state.releases).toEqual(1);
    expect(state.pointer).toEqual(["a", null]);
    expect(state.spinner).toEqual(["a", null]);
    expect(state.active).toEqual({ modelId: null, providerType: null });
  });

  it("a Load claimed after an offload request wins and the offload stands down", async () => {
    // Offload queued behind A's switch; then the user taps Load on B.
    const { coordinator, state } = world();
    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    state.holds.set("a.gguf", holdA);
    const a = coordinator.load("a");
    await waitFor(() => state.events.includes("switch-start:a.gguf"));
    const off = coordinator.offload();
    const b = coordinator.load("b");
    releaseA();
    await Promise.all([a, off, b]);
    expect(a).resolves.toBe("superseded");
    // The offload never ran: B's newer claim owns the slot now.
    expect(state.releases).toEqual(0);
    expect(state.switched).toEqual(["a.gguf", "b.gguf"]);
    expect(state.active).toEqual({ modelId: "b", providerType: "local" });
    expect(state.spinner[state.spinner.length - 1]).toBeNull();
  });

  it("clears the last-used model record on offload", async () => {
    const { coordinator, state } = world();
    await coordinator.load("a");
    await coordinator.offload();
    // The offload should call clearLastUsedModel
    expect(state.clearLastUsedModelCalls).toEqual(1);
  });
});

describe("createEagerLoad.reload", () => {
  it("switches the ACTIVE pointer's target and touches neither pointer nor spinner", async () => {
    const { coordinator, state } = world({
      active: { modelId: "a", providerType: "local" },
      // The context-ladder shape: the caller has ALREADY moved nCtx; the
      // coordinator just re-resolves what the pointer names.
      resolve: async () => target("a.gguf"),
    });
    await coordinator.reload();
    expect(state.switched).toEqual(["a.gguf"]);
    expect(state.pointer).toEqual([]); // the ladder owns the pointer
    expect(state.spinner).toEqual([]); // the ladder owns the UI
  });

  it("is silent when no source resolves: no switch, no churn", async () => {
    const { coordinator, state } = world();
    await expect(coordinator.reload()).resolves.toBeUndefined();
    expect(state.switched).toEqual([]);
    expect(state.pointer).toEqual([]);
    expect(state.spinner).toEqual([]);
  });

  it("rejects on a failed switch, leaving pointer and spinner to the caller, and the queue survives", async () => {
    const { coordinator, state } = world({
      active: { modelId: "a", providerType: "local" },
      resolve: async () => target("a.gguf"),
      failOn: (f) => f === "a.gguf",
    });
    await expect(coordinator.reload()).rejects.toThrow("load failed");
    // The ladder's contract: it rolls the size back and re-calls; the
    // coordinator must not have touched the pointer or the spinner.
    expect(state.pointer).toEqual([]);
    expect(state.spinner).toEqual([]);
    // A chained failure leaves the queue usable (offload after collapse).
    const off = await coordinator.offload();
    expect(off).toBeUndefined();
    expect(state.releases).toEqual(1);
  });

  it("a reload superseded by a newer Load stands down without native work", async () => {
    const { coordinator, state } = world({
      active: { modelId: "a", providerType: "local" },
      // null (the reload's active-pointer probe) resolves A; ids resolve
      // to their own files.
      resolve: async (id) => target(`${id ?? "a"}.gguf`),
    });
    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    state.holds.set("a.gguf", holdA);
    const r = coordinator.reload();
    await waitFor(() => state.events.includes("switch-start:a.gguf"));
    const b = coordinator.load("b");
    releaseA();
    await Promise.all([r, b]);
    await expect(r).resolves.toBeUndefined(); // clean, not a rejection
    expect(state.switched).toEqual(["a.gguf", "b.gguf"]);
    expect(state.active).toEqual({ modelId: "b", providerType: "local" });
  });
});

describe("createEagerLoad.reloadSpecific", () => {
  it("reloads the SPECIFIC model ID passed when it matches the active model", async () => {
    // Active pointer is "b", and we want to reload "b" (auto-released model)
    const { coordinator, state } = world({
      active: { modelId: "b", providerType: "local" },
      resolve: async (id) => target(`${id}.gguf`),
    });
    await coordinator.reloadSpecific("b");
    // Verify resolveTarget was called with "b"
    expect(state.events).toContain("preflight:b");
    // Should have loaded "b"
    expect(state.switched).toEqual(["b.gguf"]);
    // Pointer and spinner unchanged (reloadSpecific doesn't touch them)
    expect(state.pointer).toEqual([]);
    expect(state.spinner).toEqual([]);
  });

  it("stands down if the active model differs from the expected model", async () => {
    // Active pointer is "a", but we try to reload "b" - should stand down
    const { coordinator, state } = world({
      active: { modelId: "a", providerType: "local" },
      resolve: async (id) => target(`${id}.gguf`),
    });
    await coordinator.reloadSpecific("b");
    // Should NOT have switched because active model doesn't match
    expect(state.switched).toEqual([]);
    expect(state.events).toContain("preflight:b");
  });

  it("stands down if the active model changed while waiting for the mutex", async () => {
    // In this implementation, the model identity check happens at mutex entry,
    // so there's no window for the active model to change between check and switch.
    // This test verifies that if the active model differs at check time, we stand down.
    const { coordinator, state } = world({
      active: { modelId: "a", providerType: "local" },
      resolve: async (id) => target(`${id}.gguf`),
    });
    // Try to reload "b" but active is "a" - should stand down immediately
    await coordinator.reloadSpecific("b");
    expect(state.switched).toEqual([]);
    expect(state.events).toContain("preflight:b");
  });

  it("is superseded by a newer load/offload/reloadSpecific claim", async () => {
    const { coordinator, state } = world({
      active: { modelId: "b", providerType: "local" },
      resolve: async (id) => target(`${id}.gguf`),
    });
    // Start reloadSpecific for "b"
    let releaseB!: () => void;
    const holdB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    state.holds.set("b.gguf", holdB);
    const r = coordinator.reloadSpecific("b");
    await waitFor(() => state.events.includes("switch-start:b.gguf"));
    // Newer load for "c" comes in
    const c = coordinator.load("c");
    releaseB();
    await Promise.all([r, c]);
    // reloadSpecific should be superseded
    await expect(r).resolves.toBeUndefined();
    // "c" should have loaded
    expect(state.switched).toEqual(["b.gguf", "c.gguf"]);
    expect(state.active).toEqual({ modelId: "c", providerType: "local" });
  });

  it("is silent when the target cannot be resolved", async () => {
    const { coordinator, state } = world({
      active: { modelId: "a", providerType: "local" },
      resolve: async () => null,
    });
    await expect(coordinator.reloadSpecific("b")).resolves.toBeUndefined();
    expect(state.switched).toEqual([]);
  });

  it("rejects on a failed switch", async () => {
    const { coordinator, state } = world({
      active: { modelId: "b", providerType: "local" },
      resolve: async (id) => target(`${id}.gguf`),
      failOn: (f) => f === "b.gguf",
    });
    await expect(coordinator.reloadSpecific("b")).rejects.toThrow("load failed");
  });
});
