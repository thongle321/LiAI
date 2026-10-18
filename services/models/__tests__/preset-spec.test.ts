/** The catalog preset projected onto a ModelSpec, so a preset renders with
 *  the same card every other model uses (PocketParity: ModelCard renders the
 *  whole catalog, presets included — ModelsScreen.tsx:346-376). */

import { presetSpecView } from "../preset-spec";
import { makePreset, makeSpec } from "@/jest/fixtures/models.ts";
import type { PresetModel } from "@/types/models";

/** One file, like every real catalog preset (services/models/huggingface.ts). */
const PRESET: PresetModel = makePreset({
  description: "A tiny reasoner.",
  params: 600_000_000,
  capabilities: ["reasoning"],
  files: [
    {
      name: "Qwen3-0.6B-Q4_K_M.gguf",
      size: 751_000_000,
      downloadUrl: "u1",
      quantization: "Q4_K_M",
    },
  ],
});

describe("presetSpecView", () => {
  it("shows the catalog metadata when the preset has never been downloaded", () => {
    const view = presetSpecView(PRESET, []);

    expect(view.id).toBe("preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf");
    expect(view.name).toBe("Qwen3-0.6B");
    expect(view.author).toBe("lmstudio-community");
    expect(view.origin).toBe("preset");
    expect(view.params).toBe(600_000_000);
    expect(view.capabilities).toEqual(["reasoning"]);
    expect(view.hfUrl).toBe(
      "https://huggingface.co/lmstudio-community/Qwen3-0.6B-GGUF",
    );
  });

  it("offers the one catalog file, sized and ready to download", () => {
    const view = presetSpecView(PRESET, []);

    expect(view.files).toHaveLength(1);
    expect(view.files[0].downloadUrl).toBe("u1");
    expect(view.downloadStatus).toBe("idle");
    expect(view.downloadProgress).toBe(0);
    expect(view.downloadedBytes).toBe(0);
    expect(view.totalBytes).toBe(751_000_000);
  });

  it("carries the live transfer state from the store row", () => {
    const view = presetSpecView(PRESET, [
      makeSpec({
        downloadStatus: "downloading",
        downloadProgress: 42,
        downloadedBytes: 315_420_000,
        speedBytesPerSec: 2_000_000,
      }),
    ]);

    expect(view.downloadStatus).toBe("downloading");
    expect(view.downloadProgress).toBe(42);
    expect(view.downloadedBytes).toBe(315_420_000);
    expect(view.speedBytesPerSec).toBe(2_000_000);
  });

  it("keeps the catalog name and link when the row is downloaded", () => {
    const view = presetSpecView(PRESET, [
      makeSpec({
        downloadStatus: "completed",
        projector: {
          name: "mmproj.gguf",
          size: 900,
          downloadUrl: "p1",
        },
      }),
    ]);

    expect(view.name).toBe("Qwen3-0.6B");
    expect(view.hfUrl).toBe(
      "https://huggingface.co/lmstudio-community/Qwen3-0.6B-GGUF",
    );
    expect(view.projector?.name).toBe("mmproj.gguf");
  });

  it("ignores rows belonging to other models", () => {
    const view = presetSpecView(PRESET, [
      makeSpec({
        id: "preset-other-model.gguf",
        downloadStatus: "completed",
      }),
    ]);

    expect(view.downloadStatus).toBe("idle");
  });
});
