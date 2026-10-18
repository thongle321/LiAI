/** Preset download state: does a preset still belong to "Available to
 *  Download"? The card itself reads the store row directly (see
 *  services/models/preset-spec.ts) — this is only the group's membership. */

import { isPresetDownloaded } from "../file-state";
import { makePreset, makeSpec } from "@/jest/fixtures/models.ts";

const PRESET = makePreset();

describe("isPresetDownloaded", () => {
  it("is false with nothing stored", () => {
    expect(isPresetDownloaded([], PRESET)).toEqual(false);
  });

  it("is false when only one file finished", () => {
    const models = [
      makeSpec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf",
        downloadStatus: "completed",
      }),
    ];
    expect(isPresetDownloaded(models, PRESET)).toEqual(false);
  });

  it("is true when every file finished", () => {
    const models = PRESET.files.map((f) =>
      makeSpec({
        id: `preset-qwen3-0.6b-${f.name}`,
        downloadStatus: "completed",
      }),
    );
    expect(isPresetDownloaded(models, PRESET)).toEqual(true);
  });
});
