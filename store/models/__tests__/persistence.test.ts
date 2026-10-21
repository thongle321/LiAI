/** The model store's persistence: one writer, one shape on disk.
 *
 * The store used to write the model catalog to its storage key as a bare
 * JSON array while the persist middleware wrote the SAME key as a
 * `{ state }` blob. The array won, and the next cold start read it as a
 * legacy install and rebuilt the state from keys an earlier migration had
 * already deleted — so the selected model, the per-model settings and every
 * preference came back as defaults.
 *
 * These tests drive the store through the injected key-value storage, so a
 * cold start is just "build a store over the same storage and load it", and
 * the only thing asserted is what the user would see and what is on disk.
 */

import type { ModelSpec } from "@/types/models";
import { memoryStorage } from "@/jest/storage";
import { parseModelSettings } from "@/utils/model-settings";
import { createModelStore } from "../index";
import {
  ACTIVE_MODEL_KEY,
  HF_SEARCH_FILTERS_KEY,
  HF_TOKEN_USE_KEY,
  MEMORY_GUARD_KEY,
  MODEL_SETTINGS_KEY,
  PENDING_PROJECTION_CLEANUP_KEY,
  REMOTE_APIS_KEY,
  REMOTE_CAPS_KEY,
  STORAGE_KEY,
  TOOL_COMPAT_WARNED_KEY,
} from "../storage";

jest.mock("../storage", () => {
  const actual = jest.requireActual("../storage");
  return {
    ...actual,
    // SecureStore is reached by a DYNAMIC import, which Jest's CommonJS
    // runtime cannot resolve. On this device there is simply no secret.
    readSecret: jest.fn(async () => null),
    writeSecret: jest.fn(async () => undefined),
    deleteSecret: jest.fn(async () => undefined),
  };
});

jest.mock("@/services/downloads/download-service", () => ({
  platformDownloadService: {
    reconcileWithNative: jest.fn(async () => []),
    getAllJobs: jest.fn(() => []),
  },
}));

jest.mock("@/services/models/huggingface.ts", () => ({
  getPresets: jest.fn(async () => []),
  searchModels: jest.fn(async () => ({ results: [], nextPageLink: null })),
  getModelFiles: jest.fn(async () => []),
  buildHfModelSpec: jest.fn(),
  HfError: class HfError extends Error {},
}));

/** A model row with the fields the store reads. */
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

/** The persist middleware writes asynchronously; let it land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A cold start over the given storage. */
async function coldStart(storage: ReturnType<typeof memoryStorage>) {
  const store = createModelStore(storage);
  await store.getState().loadPersisted();
  return store;
}

/** The blob's persisted state, or null when the key holds something else. */
function blobState(storage: ReturnType<typeof memoryStorage>) {
  const raw = storage.data[STORAGE_KEY];
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed.state as Record<string, unknown>;
}

describe("model store persistence", () => {
  it("keeps the user's settings across a second cold start", async () => {
    const kv = memoryStorage();
    const first = await coldStart(kv);

    first.setState({
      models: [spec({ id: "m1" })],
      activeModelId: "m1",
      activeProviderType: "local",
      modelSettings: { m1: parseModelSettings({ displayName: "Nick" }) },
      remoteApis: [
        {
          id: "p1",
          name: "Provider",
          providerType: "openrouter",
          baseUrl: "https://x",
          apiKey: "",
          modelName: "m",
          isActive: false,
        },
      ],
      remoteCaps: { p1: { reachable: true, checkedAt: 7 } },
      privacyAcknowledged: true,
      useHfToken: false,
      toolCompatWarnedModels: ["m1"],
      pendingProjectionCleanup: ["mmproj.gguf"],
      largestSuccessfulBytes: 1234,
      searchFilters: { author: "someone", sortBy: "downloads" },
    });
    await flush();

    const second = await coldStart(kv);
    const state = second.getState();

    expect(state.activeModelId).toBe("m1");
    expect(state.activeProviderType).toBe("local");
    expect(state.modelSettings.m1?.displayName).toBe("Nick");
    expect(state.remoteApis.map((p) => p.id)).toEqual(["p1"]);
    expect(state.remoteCaps.p1?.reachable).toBe(true);
    expect(state.privacyAcknowledged).toBe(true);
    expect(state.useHfToken).toBe(false);
    expect(state.toolCompatWarnedModels).toEqual(["m1"]);
    expect(state.pendingProjectionCleanup).toEqual(["mmproj.gguf"]);
    expect(state.largestSuccessfulBytes).toBe(1234);
    expect(state.searchFilters).toEqual({ author: "someone", sortBy: "downloads" });
    expect(state.models.map((m) => m.id)).toEqual(["m1"]);
  });

  it("keeps every setting when the catalog changes", async () => {
    // A device that already holds the consolidated blob: the settings live
    // on disk, not only in a live store.
    const kv = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        state: {
          models: [spec({ id: "m1" })],
          remoteApis: [
            {
              id: "p1",
              name: "Provider",
              providerType: "openrouter",
              baseUrl: "https://x",
              apiKey: "",
              modelName: "m",
              isActive: false,
            },
          ],
          activeModelId: "m1",
          activeProviderType: "local",
          modelSettings: { m1: parseModelSettings({ displayName: "Nick" }) },
          largestSuccessfulBytes: 1234,
          remoteCaps: { p1: { reachable: true, checkedAt: 7 } },
          privacyAcknowledged: true,
          useHfToken: false,
          toolCompatWarnedModels: ["m1"],
          pendingProjectionCleanup: ["mmproj.gguf"],
          searchFilters: { author: "someone", sortBy: "downloads" },
        },
        version: 0,
      }),
    });

    const first = await coldStart(kv);
    // The user bookmarks another model.
    first.getState().addModel(spec({ id: "m2" }));
    await flush();

    const second = await coldStart(kv);
    const state = second.getState();

    expect(state.activeModelId).toBe("m1");
    expect(state.activeProviderType).toBe("local");
    expect(state.modelSettings.m1?.displayName).toBe("Nick");
    expect(state.remoteApis.map((p) => p.id)).toEqual(["p1"]);
    expect(state.remoteCaps.p1?.reachable).toBe(true);
    expect(state.privacyAcknowledged).toBe(true);
    expect(state.useHfToken).toBe(false);
    expect(state.toolCompatWarnedModels).toEqual(["m1"]);
    expect(state.pendingProjectionCleanup).toEqual(["mmproj.gguf"]);
    expect(state.largestSuccessfulBytes).toBe(1234);
    expect(state.searchFilters).toEqual({ author: "someone", sortBy: "downloads" });
    expect(state.models.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("writes one shape on disk: the blob, never a bare array", async () => {
    const kv = memoryStorage();
    const store = await coldStart(kv);
    store.getState().addModel(spec({ id: "m1" }));
    await flush();

    const raw = kv.data[STORAGE_KEY];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.state).toBeDefined();
  });

  it("carries an old install over", async () => {
    const kv = memoryStorage({
      [STORAGE_KEY]: JSON.stringify([spec({ id: "m1" })]),
      [ACTIVE_MODEL_KEY]: JSON.stringify({ modelId: "m1", providerType: "local" }),
      [MODEL_SETTINGS_KEY]: JSON.stringify({ m1: { displayName: "Nick" } }),
      [HF_TOKEN_USE_KEY]: "false",
      [MEMORY_GUARD_KEY]: JSON.stringify(1234),
      [REMOTE_APIS_KEY]: JSON.stringify([
        {
          id: "p1",
          name: "Provider",
          providerType: "openrouter",
          baseUrl: "https://x",
          apiKey: "",
          modelName: "m",
          isActive: false,
        },
      ]),
      [REMOTE_CAPS_KEY]: JSON.stringify({
        caps: { p1: { reachable: true, checkedAt: 7 } },
        privacyAcknowledged: true,
      }),
      [TOOL_COMPAT_WARNED_KEY]: JSON.stringify(["m1"]),
      [PENDING_PROJECTION_CLEANUP_KEY]: JSON.stringify(["mmproj.gguf"]),
    });

    const store = await coldStart(kv);
    const state = store.getState();

    expect(state.models.map((m) => m.id)).toEqual(["m1"]);
    expect(state.activeModelId).toBe("m1");
    expect(state.modelSettings.m1?.displayName).toBe("Nick");
    expect(state.useHfToken).toBe(false);
    expect(state.largestSuccessfulBytes).toBe(1234);
    expect(state.remoteApis.map((p) => p.id)).toEqual(["p1"]);
    expect(state.remoteCaps.p1?.reachable).toBe(true);
    expect(state.privacyAcknowledged).toBe(true);
    expect(state.toolCompatWarnedModels).toEqual(["m1"]);
    expect(state.pendingProjectionCleanup).toEqual(["mmproj.gguf"]);

    // The upgrade left the consolidated blob behind...
    expect(blobState(kv)).not.toBeNull();
    // ...and cleared the legacy keys it consumed.
    expect(kv.data[ACTIVE_MODEL_KEY]).toBeUndefined();
    expect(kv.data[MODEL_SETTINGS_KEY]).toBeUndefined();
    expect(kv.data[HF_TOKEN_USE_KEY]).toBeUndefined();
    expect(kv.data[MEMORY_GUARD_KEY]).toBeUndefined();
    expect(kv.data[REMOTE_APIS_KEY]).toBeUndefined();
    expect(kv.data[REMOTE_CAPS_KEY]).toBeUndefined();
    expect(kv.data[TOOL_COMPAT_WARNED_KEY]).toBeUndefined();
    expect(kv.data[PENDING_PROJECTION_CLEANUP_KEY]).toBeUndefined();
  });

  it("recovers a device left with the broken bare-array shape", async () => {
    const kv = memoryStorage({
      [STORAGE_KEY]: JSON.stringify([spec({ id: "m1" })]),
      [ACTIVE_MODEL_KEY]: JSON.stringify({ modelId: "m1", providerType: "local" }),
      [HF_TOKEN_USE_KEY]: "false",
    });

    const store = await coldStart(kv);
    const state = store.getState();

    expect(state.models.map((m) => m.id)).toEqual(["m1"]);
    expect(state.activeModelId).toBe("m1");
    expect(state.useHfToken).toBe(false);
  });

  it("never writes a legacy key again", async () => {
    const kv = memoryStorage({
      [ACTIVE_MODEL_KEY]: JSON.stringify({ modelId: "m1", providerType: "local" }),
      [HF_TOKEN_USE_KEY]: "false",
    });

    const store = await coldStart(kv);
    store.getState().setActiveModel("m2", "local");
    await flush();

    expect(kv.data[ACTIVE_MODEL_KEY]).toBeUndefined();
    expect(kv.data[HF_TOKEN_USE_KEY]).toBeUndefined();
    // Every write went to the consolidated key, and the consolidated shape
    // is what is on disk.
    expect(kv.writes.every((key) => key === STORAGE_KEY)).toBe(true);
    expect(blobState(kv)).not.toBeNull();
  });

  it("writes the catalog when the download status changes", async () => {
    const kv = memoryStorage();
    const store = await coldStart(kv);
    store.getState().addModel(spec({ id: "m1", downloadStatus: "downloading" }));
    await flush();

    const writesBefore = kv.writes.length;
    store.getState().setModelProgress("m1", {
      downloadStatus: "completed",
      downloadProgress: 100,
    });
    await flush();

    expect(kv.writes.length).toBeGreaterThan(writesBefore);
  });

  it("leaves the transfer counters out of the persisted model", async () => {
    const kv = memoryStorage();
    const store = await coldStart(kv);
    store.getState().addModel(
      spec({
        id: "m1",
        downloadStatus: "downloading",
        downloadProgress: 40,
        downloadedBytes: 400,
        totalBytes: 1000,
      }),
    );
    await flush();

    const models = blobState(kv)?.models as Record<string, unknown>[];
    expect(models[0]).not.toHaveProperty("downloadProgress");
    expect(models[0]).not.toHaveProperty("downloadedBytes");
    expect(models[0]).not.toHaveProperty("totalBytes");
    expect(models[0]).not.toHaveProperty("speedBytesPerSec");
    // The durable part still survives: the model is still known to be
    // downloaded.
    expect(models[0].downloadStatus).toBe("downloading");
  });

  it("does not rewrite the catalog for a download progress tick", async () => {
    const kv = memoryStorage();
    const store = await coldStart(kv);
    store.getState().addModel(spec({ id: "m1", downloadStatus: "downloading" }));
    await flush();

    const writesBefore = kv.writes.length;
    store.getState().setModelProgress("m1", {
      downloadProgress: 40,
      downloadedBytes: 400,
      totalBytes: 1000,
    });
    await flush();

    expect(kv.writes.length).toBe(writesBefore);
  });

  it("keeps the same search default on a fresh install and after an upgrade", async () => {
    const fresh = await coldStart(memoryStorage());
    const upgraded = await coldStart(
      memoryStorage({ [STORAGE_KEY]: JSON.stringify([spec({ id: "m1" })]) }),
    );

    expect(upgraded.getState().searchFilters).toEqual(
      fresh.getState().searchFilters,
    );
  });

  it("carries the saved search filters over on an upgrade", async () => {
    const kv = memoryStorage({
      [STORAGE_KEY]: JSON.stringify([spec({ id: "m1" })]),
      [HF_SEARCH_FILTERS_KEY]: JSON.stringify({ author: "someone", sortBy: "downloads" }),
    });

    const store = await coldStart(kv);
    expect(store.getState().searchFilters).toEqual({
      author: "someone",
      sortBy: "downloads",
    });
  });
});
