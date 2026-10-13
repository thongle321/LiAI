/** Kokoro tracer (issue 02) — the reusable download bridge.
 *
 * The bridge wraps sherpa-onnx's download manager for the TTS category and
 * maps its progress onto PocketPal's DownloadState machine
 * (not_installed / downloading / ready / error) + percent, which ticket 03's
 * store consumes. The native module is never imported here: the bridge takes
 * an injected loader (repo keep-awake pattern), and these tests drive it with
 * a fake API shaped like `react-native-sherpa-onnx/download`'s exports.
 *
 * Run: node --test tests/tts-download.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTtsDownloadBridge,
  type SherpaTtsDownloadApi,
  type TtsModelStatus,
} from "../lib/tts/download.ts";

/** A fake sherpa download API. Every method records its call; overrides
 *  hook per-test behaviour. Category is compared as a plain string — the
 *  real enum's value is "tts". */
function fakeApi(overrides: Partial<SherpaTtsDownloadApi> = {}) {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const record =
    <A extends unknown[], R>(fn: string, impl: (...args: A) => R) =>
    (...args: A): R => {
      calls.push({ fn, args });
      return impl(...args);
    };

  const api: SherpaTtsDownloadApi = {
    refreshModels: record("refreshModels", overrides.refreshModels ?? (() => Promise.resolve([]))),
    downloadModel:
      record(
        "downloadModel",
        overrides.downloadModel ??
          ((id) => Promise.resolve({ modelId: id, localPath: "/models/x" })),
      ),
    isModelDownloaded:
      record("isModelDownloaded", overrides.isModelDownloaded ?? (() => Promise.resolve(false))),
    getModelPath: record("getModelPath", overrides.getModelPath ?? (() => Promise.resolve(null))),
  };
  return { api, calls };
}

describe("tts download bridge — status machine", () => {
  it("reports not_installed, then ready from the disk check, with percent floors", async () => {
    const { api, calls } = fakeApi();
    const bridge = createTtsDownloadBridge(async () => api);

    assert.deepEqual(await bridge.status("kokoro-en-v0_19"), {
      state: "not_installed",
      percent: 0,
    });
    assert.deepEqual(calls.at(-1), {
      fn: "isModelDownloaded",
      args: ["tts", "kokoro-en-v0_19"],
    });

    fakeApiSetDownloaded(api, true);
    assert.deepEqual(await bridge.status("kokoro-en-v0_19"), {
      state: "ready",
      percent: 100,
    });
  });

  it("exposes the local path for an already-downloaded model (restart path)", async () => {
    const { api } = fakeApi({
      getModelPath: () => Promise.resolve("/docs/sherpa-onnx/models/tts/kokoro"),
    });
    const bridge = createTtsDownloadBridge(async () => api);
    assert.equal(
      await bridge.localPath("kokoro"),
      "/docs/sherpa-onnx/models/tts/kokoro",
    );
  });
});

describe("tts download bridge — download", () => {
  it("walks downloading → progress → ready(100) and resolves the local path", async () => {
    const seenSignals: AbortSignal[] = [];
    const { api, calls } = fakeApi({
      downloadModel: (_category, id, opts) => {
        if (opts?.signal) seenSignals.push(opts.signal);
        opts?.onProgress?.({ percent: 42.5, phase: "downloading" });
        opts?.onProgress?.({ percent: 90, phase: "extracting" });
        return Promise.resolve({ modelId: id, localPath: "/models/tts/" + id });
      },
    });
    const bridge = createTtsDownloadBridge(async () => api);

    const transitions: TtsModelStatus[] = [];
    const path = await bridge.download("kokoro-int8-en-v0_19", (s) =>
      transitions.push(s),
    );

    assert.equal(path, "/models/tts/kokoro-int8-en-v0_19");
    assert.deepEqual(transitions, [
      { state: "downloading", percent: 0 },
      { state: "downloading", percent: 42.5 },
      { state: "downloading", percent: 90 },
      { state: "ready", percent: 100 },
    ]);
    // Downloaded under the TTS category with an abortable signal.
    const call = calls.find((c) => c.fn === "downloadModel");
    assert.equal(call?.args[0], "tts");
    assert.equal(call?.args[1], "kokoro-int8-en-v0_19");
    assert.equal(seenSignals.length, 1);
    assert.equal(seenSignals[0]?.aborted, false);
  });

  it("populates the registry before downloading, or sherpa rejects the id", async () => {
    // Regression: sherpa's downloadModel resolves the id through
    // getModelById, which reads ONLY the on-disk registry cache and never
    // fetches. With no refreshModels() call first, the cache is empty on a
    // fresh install and EVERY download throws `Unknown model id: <id>`.
    const { api, calls } = registryGatedApi();
    const bridge = createTtsDownloadBridge(async () => api);

    const path = await bridge.download("kokoro-int8-en-v0_19", () => {});

    assert.equal(path, "/models/tts/kokoro-int8-en-v0_19");
    assert.ok(
      calls.some((c) => c.fn === "refreshModels"),
      "registry must be refreshed before downloadModel",
    );
    // ...and refreshed first, not after the failed lookup.
    assert.equal(calls[0]?.fn, "refreshModels");
  });

  it("clamps a percent the native side lost track of", async () => {
    const { api } = fakeApi({
      downloadModel: (_c, id, opts) => {
        opts?.onProgress?.({ percent: 150 });
        return Promise.resolve({ modelId: id, localPath: "/m" });
      },
    });
    const bridge = createTtsDownloadBridge(async () => api);

    const transitions: TtsModelStatus[] = [];
    await bridge.download("m", (s) => transitions.push(s));
    assert.deepEqual(transitions.at(-1), { state: "ready", percent: 100 });
    assert.deepEqual(transitions[1], { state: "downloading", percent: 100 });
  });

  it("lands in error with the reason and rethrows", async () => {
    const { api } = fakeApi({
      downloadModel: () => Promise.reject(new Error("HTTP 503")),
    });
    const bridge = createTtsDownloadBridge(async () => api);

    const transitions: TtsModelStatus[] = [];
    await assert.rejects(
      bridge.download("m", (s) => transitions.push(s)),
      /HTTP 503/,
    );
    assert.deepEqual(transitions, [
      { state: "downloading", percent: 0 },
      { state: "error", percent: 0, error: "HTTP 503" },
    ]);
  });

  it("abort() cancels the in-flight download back to not_installed", async () => {
    const { api } = fakeApi({
      // Mirrors sherpa: a signal already aborted when downloadModel is
      // reached rejects immediately rather than waiting for an event.
      downloadModel: (_c, _id, opts) =>
        new Promise((_resolve, reject) => {
          const fail = () =>
            reject(
              Object.assign(new Error("Download aborted"), { name: "AbortError" }),
            );
          if (opts?.signal?.aborted) return fail();
          opts?.signal?.addEventListener("abort", fail);
        }),
    });
    const bridge = createTtsDownloadBridge(async () => api);

    const transitions: TtsModelStatus[] = [];
    const pending = bridge.download("m", (s) => transitions.push(s));
    await Promise.resolve(); // let download reach the native call
    bridge.abort();
    await assert.rejects(pending, /Download aborted/);
    // Sherpa resumes partial downloads on the next attempt, so a cancel
    // reads as "not installed yet", not as an error.
    assert.deepEqual(transitions.at(-1), { state: "not_installed", percent: 0 });
  });

  it("abort() with nothing in flight is a no-op", () => {
    const { api } = fakeApi();
    const bridge = createTtsDownloadBridge(async () => api);
    assert.doesNotThrow(() => bridge.abort());
  });
});

describe("tts download bridge — registry refresh", () => {
  it("refreshes the TTS category and passes the models through", async () => {
    const models = [
      { id: "kokoro-en-v0_19", bytes: 320_000_000 },
      { id: "kokoro-int8-en-v0_19", bytes: 103_000_000 },
    ];
    const { api, calls } = fakeApi({
      refreshModels: () => Promise.resolve(models),
    });
    const bridge = createTtsDownloadBridge(async () => api);

    assert.deepEqual(await bridge.refresh({ forceRefresh: true }), models);
    assert.deepEqual(calls.at(-1), {
      fn: "refreshModels",
      args: ["tts", { forceRefresh: true }],
    });
  });
});

/** A fake that reproduces sherpa's REAL contract: downloadModel resolves
 *  the id via getModelById, which lists the on-disk registry cache and
 *  never fetches — so an unrefreshed cache rejects every id. The plain
 *  fakeApi resolves unconditionally, which is exactly how the
 *  missing-refresh bug reached a device with the suite green. */
function registryGatedApi() {
  let registered: string[] = [];
  const { api, calls } = fakeApi({
    refreshModels: () => {
      registered = ["kokoro-int8-en-v0_19", "kokoro-en-v0_19"];
      return Promise.resolve(registered.map((id) => ({ id, bytes: 1 })));
    },
  });
  api.downloadModel = (category, id) => {
    calls.push({ fn: "downloadModel", args: [category, id] });
    if (!registered.includes(id)) {
      return Promise.reject(new Error(`Unknown model id: ${id}`));
    }
    return Promise.resolve({ modelId: id, localPath: `/models/tts/${id}` });
  };
  return { api, calls };
}

/** Mutate the fake's disk check without rebuilding the bridge. */
function fakeApiSetDownloaded(api: SherpaTtsDownloadApi, value: boolean): void {
  api.isModelDownloaded = () => Promise.resolve(value);
}
