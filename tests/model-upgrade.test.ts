/** Store upgrade tests. Run: node --test frontend/tests/model-upgrade.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  upgradeModelList,
  upgradeModelSpec,
  upgradeRemoteApis,
  upgradeRemoteCaps,
} from "../lib/model-upgrade.ts";
import { HF_TOKEN_SS_KEY, providerKeySS } from "../lib/secrets.ts";

describe("upgradeModelSpec", () => {
  it("prunes unrecognizable records", () => {
    for (const bad of [null, 42, "x", [], {}, { name: "no-id" }]) {
      assert.equal(upgradeModelSpec(bad), null);
    }
  });

  it("reconciles a v0 record with sane defaults", () => {
    const out = upgradeModelSpec({ id: "m1", name: "M", downloadStatus: "bogus" });
    assert.equal(out?.downloadStatus, "idle");
    assert.equal(out?.origin, "local");
    assert.equal(out?.type, "llm");
    assert.deepEqual(out?.files, []);
    assert.equal(out?.params, undefined);
  });

  it("resets transient download state: downloading restarts idle, errors drop", () => {
    const out = upgradeModelSpec({
      id: "m1",
      name: "M",
      downloadStatus: "downloading",
      downloadProgress: 42,
      downloadedBytes: 100,
      totalBytes: 200,
      error: "Call to function 'FileSystemDownloadTask.start' has been rejected",
    });
    assert.equal(out?.downloadStatus, "idle");
    assert.equal(out?.downloadProgress, 0);
    assert.equal(out?.downloadedBytes, 0);
    assert.equal(out?.totalBytes, 200);
    assert.equal(out?.error, undefined);
  });

  it("keeps a failed badge but drops its message", () => {
    const out = upgradeModelSpec({
      id: "m1",
      name: "M",
      downloadStatus: "failed",
      error: "HTTP 403",
    });
    assert.equal(out?.downloadStatus, "failed");
    assert.equal(out?.error, undefined);
  });

  it("keeps valid new fields", async () => {
    const out = upgradeModelSpec({
      id: "m1",
      name: "M",
      files: [{ name: "f.gguf", size: 1, downloadUrl: "u" }],
      downloadStatus: "completed",
      params: 135_000_000,
      capabilities: ["chat", 7],
    });
    assert.equal(out?.params, 135_000_000);
    assert.deepEqual(out?.capabilities, ["chat"]);
  });
});

describe("upgradeModelList", () => {
  it("drops bad entries, keeps good ones", () => {
    const out = upgradeModelList([{ id: "a", name: "A" }, null, { nope: 1 }]);
    assert.deepEqual(out.map((m) => m.id), ["a"]);
    assert.deepEqual(upgradeModelList("nope"), []);
  });
});

describe("upgradeRemoteApis", () => {
  it("keeps valid providers with blank keys, drops malformed", () => {
    const out = upgradeRemoteApis([
      { id: "p1", name: "P", baseUrl: "u", modelName: "m", providerType: "openrouter", apiKey: "sk-x" },
      { id: "bad" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].apiKey, "");
    assert.equal(out[0].providerType, "openrouter");
  });

  it("keeps a valid stored timeout, drops a non-positive or non-finite one", () => {
    const out = upgradeRemoteApis([
      { id: "p1", name: "P", baseUrl: "u", modelName: "m", timeoutMs: 45_000 },
      { id: "p2", name: "Q", baseUrl: "u", modelName: "m", timeoutMs: 0 },
      { id: "p3", name: "R", baseUrl: "u", modelName: "m", timeoutMs: -5 },
      { id: "p4", name: "S", baseUrl: "u", modelName: "m", timeoutMs: null },
      { id: "p5", name: "T", baseUrl: "u", modelName: "m" },
    ]);
    assert.equal(out[0].timeoutMs, 45_000);
    // Unset means "use the default", never zero.
    assert.equal(out[1].timeoutMs, undefined);
    assert.equal(out[2].timeoutMs, undefined);
    assert.equal(out[3].timeoutMs, undefined);
    assert.equal(out[4].timeoutMs, undefined);
  });
});

describe("upgradeRemoteCaps", () => {
  it("keeps valid snapshots, drops malformed", () => {
    const out = upgradeRemoteCaps({
      p1: { reachable: false, checkedAt: 123 },
      p2: { reachable: "yes" },
    });
    assert.deepEqual(out, { p1: { reachable: false, checkedAt: 123 } });
    assert.deepEqual(upgradeRemoteCaps(null), {});
  });

  it("hydrates the C7 model-keyed fields, guarding each on its own", () => {
    const out = upgradeRemoteCaps({
      p1: {
        reachable: true,
        checkedAt: 1,
        model: "qwen",
        contextLength: 8192,
        supportsVision: true,
      },
      // Invalid values drop; capability fields without a model drop too
      // (caps are keyed per model — unkeyed fields could not be trusted).
      p2: {
        reachable: true,
        checkedAt: 2,
        model: "qwen",
        contextLength: 0,
        supportsVision: "yes",
      },
      p3: { reachable: true, checkedAt: 3, contextLength: 4096 },
    });
    assert.deepEqual(out.p1, {
      reachable: true,
      checkedAt: 1,
      model: "qwen",
      contextLength: 8192,
      supportsVision: true,
    });
    assert.deepEqual(out.p2, { reachable: true, checkedAt: 2, model: "qwen" });
    assert.deepEqual(out.p3, { reachable: true, checkedAt: 3 });
  });
});

describe("secrets keys", () => {  it("namespaces per provider", () => {
    assert.equal(providerKeySS("abc"), "liai_provider_key_abc");
    assert.equal(HF_TOKEN_SS_KEY, "liai_hf_token");
  });
});
