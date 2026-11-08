/** A companion's recommended model, resolved against the LIVE catalog
 *  (PocketPal's ModelNotAvailable).
 *
 *  PocketPal stores the whole model JSON, so it can re-download a deleted
 *  recommendation. LiAI stores a ref (types/companion.ts), so the only
 *  recoverable case is a catalog preset: the preset still carries the file
 *  URL the ref omits.
 */

import { resolveCompanionModelStatus } from "../model-availability.ts";
import { makePreset, makeSpec } from "@/jest/fixtures/models.ts";
import type { CompanionModelRef } from "@/types/companion.ts";

const ref = (id: string): CompanionModelRef => ({
  id,
  name: "Model One",
  author: "Author",
  file: { name: "m.gguf", size: 10 },
});

describe("resolveCompanionModelStatus", () => {
  it("is none without a recommendation", () => {
    expect(resolveCompanionModelStatus(undefined, [], [])).toEqual({ state: "none" });
  });

  it("is ready when the recommended spec is downloaded", () => {
    expect(
      resolveCompanionModelStatus(
        ref("m"),
        [makeSpec({ id: "m", downloadStatus: "completed" })],
        [],
      ),
    ).toEqual({ state: "ready" });
  });

  it("reports progress while the model is downloading", () => {
    expect(
      resolveCompanionModelStatus(
        ref("m"),
        [makeSpec({ id: "m", downloadStatus: "downloading", downloadProgress: 42 })],
        [],
      ),
    ).toEqual({ state: "downloading", progress: 42 });
  });

  it("offers a preset download when the catalog still ships the model", () => {
    const preset = makePreset({
      id: "p",
      name: "Preset One",
      files: [{ name: "p.gguf", size: 99, downloadUrl: "u" }],
    });
    expect(
      resolveCompanionModelStatus(ref("preset-p-p.gguf"), [], [preset]),
    ).toEqual({
      state: "downloadable",
      name: "Preset One",
      size: 99,
      presetId: "p",
      file: preset.files[0],
    });
  });

  it("is unavailable when nothing can supply the file", () => {
    expect(resolveCompanionModelStatus(ref("gone"), [], [])).toEqual({
      state: "unavailable",
      name: "Model One",
      size: 10,
    });
  });
});
