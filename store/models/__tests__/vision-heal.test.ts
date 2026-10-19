/** The vision heal and the projection cleanup queue.
 *
 * A draft repository carries an mmproj, so the pairing heuristic classified
 * it as vision-capable and the app downloaded a projector a draft can never
 * use. The heal undoes the classification; the drain deletes the file the
 * misclassification fetched.
 *
 * The file system and the download service are injected, so nothing native
 * is touched and every decision is exact. */

import type { ModelSpec } from "@/types/models";
import type { KeyValueStorage } from "@/services/storage/storage";
import {
  createVisionHealSlice,
  drainProjectionCleanup,
  parseProjectionCleanupQueue,
  planVisionHeal,
  type ProjectionCleanupDeps,
} from "../vision-heal";

/** A model row with the fields the heal reads, defaulted. */
function spec(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "model-1",
    name: "Model",
    author: "Author",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [{ name: "model.gguf", size: 1, downloadUrl: "https://x/model.gguf" }],
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 1,
    totalBytes: 1,
    ...overrides,
  };
}

/** The recorded calls of a fake device. */
function fakeDeps(
  overrides: Partial<ProjectionCleanupDeps> = {},
): ProjectionCleanupDeps & { deleted: string[]; stored: string[]; onDisk: Set<string> } {
  const deleted: string[] = [];
  const stored: string[] = [];
  const onDisk = new Set<string>();
  return {
    deleted,
    stored,
    onDisk,
    deleteProjectorFile: async (name) => {
      deleted.push(name);
      onDisk.delete(name);
    },
    projectorFileExists: async (name) => onDisk.has(name),
    isDownloading: async () => false,
    ...overrides,
  };
}

/** A store with just the slice under test plus the two actions it calls. */
function makeStore(deps: ProjectionCleanupDeps, initial: Partial<ModelStoreShape> = {}) {
  const state = {
    models: [] as ModelSpec[],
  } as unknown as ModelStoreShape;
  const set = (partial: unknown) => {
    const patch =
      typeof partial === "function"
        ? (partial as (s: ModelStoreShape) => Partial<ModelStoreShape>)(state)
        : (partial as Partial<ModelStoreShape>);
    Object.assign(state, patch);
  };
  const get = () => state;
  const slice = createVisionHealSlice(deps)(set as never, get as never, {} as never);
  // The slice first, the given state second: the slice carries its own
  // initial state and would otherwise overwrite what the test sets up.
  Object.assign(state, slice);
  Object.assign(state, initial);
  return state;
}

/** The parts of the model store this slice touches. */
type ModelStoreShape = {
  models: ModelSpec[];
  pendingProjectionCleanup: string[];
  healDraftVisionClassification: () => void;
  drainPendingProjectionCleanup: () => Promise<void>;
};

describe("planVisionHeal", () => {
  it("turns off vision on a draft model and detaches its projector", () => {
    const draft = spec({
      supportsVision: true,
      visionEnabled: true,
      capabilities: ["chat", "vision"],
      projector: {
        name: "mmproj.gguf",
        size: 1,
        downloadUrl: "https://x/mmproj.gguf",
      },
      projectorCandidates: [
        { name: "mmproj.gguf", size: 1, downloadUrl: "https://x/mmproj.gguf" },
      ],
      ggufMetadata: { architecture: "qwen3-mtp" },
    });

    const plan = planVisionHeal([draft]);

    expect(plan.changed).toBe(true);
    expect(plan.queue).toEqual(["mmproj.gguf"]);
    const healed = plan.models[0];
    // FALSE, never undefined: utils/model-upgrade.ts re-infers
    // supportsVision from "has a projector" when the field is absent.
    expect(healed.supportsVision).toBe(false);
    expect(healed.visionEnabled).toBe(false);
    expect(healed.projector).toBeUndefined();
    expect(healed.projectorCandidates).toBeUndefined();
    expect(healed.capabilities).toEqual(["chat"]);
  });

  it("leaves an ordinary chat model alone", () => {
    const chat = spec({
      supportsVision: true,
      visionEnabled: true,
      ggufMetadata: { architecture: "llama" },
    });

    const plan = planVisionHeal([chat]);

    expect(plan.changed).toBe(false);
    expect(plan.models[0]).toBe(chat);
    expect(plan.queue).toEqual([]);
  });

  it("waits for the header of a downloaded model before guessing", () => {
    // No ggufMetadata yet: the backfill may still say "chat model", and a
    // filename guess must never overrule a header we have not seen.
    const draft = spec({
      supportsVision: true,
      files: [{ name: "mtp-model.gguf", size: 1, downloadUrl: "https://x" }],
    });

    expect(planVisionHeal([draft]).changed).toBe(false);
  });

  it("heals a downloaded model once its header says draft", () => {
    const draft = spec({
      supportsVision: true,
      ggufMetadata: { architecture: "qwen3-mtp" },
    });

    expect(planVisionHeal([draft]).changed).toBe(true);
  });

  it("leaves a model that never claimed vision alone", () => {
    const draft = spec({
      supportsVision: false,
      ggufMetadata: { architecture: "qwen3-mtp" },
    });

    expect(planVisionHeal([draft]).changed).toBe(false);
  });

  it("heals a not-yet-downloaded model from the filename", () => {
    // The Hub search has no header to consult, and the repo's own mmproj
    // is what got it classified as vision in the first place.
    const draft = spec({
      downloadStatus: "idle",
      downloadProgress: 0,
      supportsVision: true,
      files: [{ name: "mtp-model.gguf", size: 1, downloadUrl: "https://x" }],
    });

    expect(planVisionHeal([draft]).changed).toBe(true);
  });
});

describe("drainProjectionCleanup", () => {
  it("deletes an orphaned projector and forgets it", async () => {
    const deps = fakeDeps();
    deps.onDisk.add("mmproj.gguf");

    const remaining = await drainProjectionCleanup(["mmproj.gguf"], [], deps);

    expect(remaining).toEqual([]);
    expect(deps.deleted).toEqual(["mmproj.gguf"]);
  });

  it("never deletes a projector another model still uses", async () => {
    const deps = fakeDeps();
    const other = spec({
      id: "model-2",
      projector: {
        name: "mmproj.gguf",
        size: 1,
        downloadUrl: "https://x/mmproj.gguf",
      },
    });

    const remaining = await drainProjectionCleanup(
      ["mmproj.gguf"],
      [other],
      deps,
    );

    expect(remaining).toEqual([]);
    expect(deps.deleted).toEqual([]);
  });

  it("keeps a projector whose download is in flight", async () => {
    const deps = fakeDeps({ isDownloading: async () => true });

    const remaining = await drainProjectionCleanup(["mmproj.gguf"], [], deps);

    expect(remaining).toEqual(["mmproj.gguf"]);
    expect(deps.deleted).toEqual([]);
  });

  it("forgets a projector that is not on disk", async () => {
    const deps = fakeDeps();

    const remaining = await drainProjectionCleanup(["mmproj.gguf"], [], deps);

    expect(remaining).toEqual([]);
    expect(deps.deleted).toEqual([]);
  });

  it("keeps a projector whose delete failed, so it retries next launch", async () => {
    const deps = fakeDeps({
      deleteProjectorFile: async () => {
        throw new Error("locked");
      },
      projectorFileExists: async () => true,
    });

    const remaining = await drainProjectionCleanup(["mmproj.gguf"], [], deps);

    expect(remaining).toEqual(["mmproj.gguf"]);
  });

  it("keeps a projector that survived the delete", async () => {
    const deps = fakeDeps({
      deleteProjectorFile: async () => undefined,
      projectorFileExists: async () => true,
    });

    const remaining = await drainProjectionCleanup(["mmproj.gguf"], [], deps);

    expect(remaining).toEqual(["mmproj.gguf"]);
  });
});

describe("parseProjectionCleanupQueue", () => {
  it("reads a persisted list", () => {
    expect(parseProjectionCleanupQueue('["a.gguf","b.gguf"]')).toEqual([
      "a.gguf",
      "b.gguf",
    ]);
  });

  it("treats a corrupt payload as an empty queue", () => {
    expect(parseProjectionCleanupQueue("not json")).toEqual([]);
    expect(parseProjectionCleanupQueue('{"a":1}')).toEqual([]);
    expect(parseProjectionCleanupQueue("[1,null]")).toEqual([]);
    expect(parseProjectionCleanupQueue(null)).toEqual([]);
  });
});

describe("the vision heal slice", () => {
  it("heals the catalog and queues the projector in one go", async () => {
    const deps = fakeDeps();
    const store = makeStore(deps, {
      models: [
        spec({
          supportsVision: true,
          visionEnabled: true,
          projector: {
            name: "mmproj.gguf",
            size: 1,
            downloadUrl: "https://x/mmproj.gguf",
          },
          ggufMetadata: { architecture: "qwen3-mtp" },
        }),
      ],
    });

    await store.healDraftVisionClassification();

    expect(store.models[0].supportsVision).toBe(false);
    expect(store.pendingProjectionCleanup).toEqual(["mmproj.gguf"]);
  });

  it("keeps what is already queued and adds the new names", async () => {
    const deps = fakeDeps();
    const store = makeStore(deps, {
      pendingProjectionCleanup: ["older.gguf"],
      models: [
        spec({
          supportsVision: true,
          projector: {
            name: "mmproj.gguf",
            size: 1,
            downloadUrl: "https://x/mmproj.gguf",
          },
          ggufMetadata: { architecture: "qwen3-mtp" },
        }),
      ],
    });

    await store.healDraftVisionClassification();

    expect(store.pendingProjectionCleanup).toEqual([
      "older.gguf",
      "mmproj.gguf",
    ]);
  });

  it("does not touch the catalog when nothing needs healing", async () => {
    const deps = fakeDeps();
    const store = makeStore(deps, {
      models: [spec({ ggufMetadata: { architecture: "llama" } })],
    });

    await store.healDraftVisionClassification();

    expect(store.pendingProjectionCleanup).toEqual([]);
  });

  it("drains the queue and leaves what it could not delete", async () => {
    const deps = fakeDeps();
    deps.onDisk.add("mmproj.gguf");
    const store = makeStore(deps, {
      pendingProjectionCleanup: ["mmproj.gguf"],
    });

    await store.drainPendingProjectionCleanup();

    expect(deps.deleted).toEqual(["mmproj.gguf"]);
    expect(store.pendingProjectionCleanup).toEqual([]);
  });

  it("keeps a queue entry whose file could not be deleted", async () => {
    const deps = fakeDeps({
      deleteProjectorFile: async () => {
        throw new Error("file is busy");
      },
    });
    deps.onDisk.add("mmproj.gguf");
    const store = makeStore(deps, {
      pendingProjectionCleanup: ["mmproj.gguf"],
    });

    await store.drainPendingProjectionCleanup();

    expect(store.pendingProjectionCleanup).toEqual(["mmproj.gguf"]);
  });

  it("heals the catalog and the queue in one state update, so a kill cannot orphan a file", async () => {
    // A file with no owner and no queue entry is never cleaned up again.
    // One write carries both, so the disk never holds a healed catalog
    // without the queue that goes with it.
    const deps = fakeDeps();
    const store = makeStore(deps, {
      models: [
        spec({
          supportsVision: true,
          projector: {
            name: "mmproj.gguf",
            size: 1,
            downloadUrl: "https://x/mmproj.gguf",
          },
          ggufMetadata: { architecture: "qwen3-mtp" },
        }),
      ],
    });

    await store.healDraftVisionClassification();

    // Both landed in the same state, so one persist write carries them.
    expect(store.models[0].supportsVision).toBe(false);
    expect(store.pendingProjectionCleanup).toEqual(["mmproj.gguf"]);
  });
});
