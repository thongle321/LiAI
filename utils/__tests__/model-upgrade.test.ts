/** The persisted model's capability flags are three-valued.
 *
 * `reasoning` and `supportsTools` both mean: true = known, false = known
 * NOT, absent = never classified. The absent case must survive a
 * restart as absent — a corrupt or missing value must not become a
 * permanent "does not support tools", which would accuse a capable model
 * forever. */

import { upgradeModelSpec } from "../model-upgrade";

function raw(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "model-1",
    name: "Tiny",
    author: "someone",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [{ name: "tiny.gguf", size: 1, downloadUrl: "https://example.com" }],
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 1,
    totalBytes: 1,
    ...overrides,
  };
}

describe("upgradeModelSpec — supportsTools", () => {
  it("keeps a known true", () => {
    expect(upgradeModelSpec(raw({ supportsTools: true }))?.supportsTools).toBe(
      true,
    );
  });

  it("keeps a known false", () => {
    expect(upgradeModelSpec(raw({ supportsTools: false }))?.supportsTools).toBe(
      false,
    );
  });

  it("leaves an unprobed model absent", () => {
    expect(
      upgradeModelSpec(raw({}))?.supportsTools,
    ).toBeUndefined();
  });

  it("drops a corrupt value instead of reading it as false", () => {
    expect(
      upgradeModelSpec(raw({ supportsTools: "no" }))?.supportsTools,
    ).toBeUndefined();
    expect(
      upgradeModelSpec(raw({ supportsTools: 0 }))?.supportsTools,
    ).toBeUndefined();
  });
});
