/** A Hub search result projected onto a ModelSpec.
 *
 *  The rule under test: a speculative DRAFT that lives in a vision repo
 *  cannot use the repo's mmproj. It would pull the projector down for
 *  nothing and offer image attach on a model that never loads — the
 *  misclassification the vision heal later repairs.
 *
 *  PocketPal parity: hfAsModel (pocketpal-ai/src/utils/index.ts:415),
 *  where `isVisionLLM = isVision && !isProjModel && !isDraftOnly`. */

import { buildHfModelSpec, type HFModelRef } from "../spec-builders.ts";
import type { HFModelFile } from "@/types/models.ts";

/** A vision repo: an mmproj next to the weights. */
const VISION_REPO: HFModelRef = {
  modelId: "owner/repo",
  author: "owner",
  name: "repo",
  description: "",
  tags: ["vision"],
  siblings: [
    { name: "model.gguf", size: 10, path: "model.gguf", downloadUrl: "u1" },
    {
      name: "mmproj-model-f16.gguf",
      size: 20,
      path: "mmproj-model-f16.gguf",
      downloadUrl: "u2",
    },
  ],
};

function file(name: string): HFModelFile {
  return { name, size: 10, path: name, downloadUrl: "u1" };
}

describe("buildHfModelSpec", () => {
  it("marks a vision repo's model as vision-capable", () => {
    const spec = buildHfModelSpec(VISION_REPO, file("model.gguf"));

    expect(spec.supportsVision).toBe(true);
    expect(spec.visionEnabled).toBe(true);
    expect(spec.projectorCandidates?.map((c) => c.name)).toEqual([
      "mmproj-model-f16.gguf",
    ]);
  });

  it("does not mark a DRAFT in a vision repo as vision-capable", () => {
    // The publisher's draft naming: "mtp-<target>".
    const spec = buildHfModelSpec(VISION_REPO, file("mtp-Qwen3-30B-A3B.gguf"));

    expect(spec.supportsVision).toBe(false);
    expect(spec.visionEnabled).toBeUndefined();
  });

  it("gives a draft no projector to choose either", () => {
    const spec = buildHfModelSpec(VISION_REPO, file("mtp-Qwen3-30B-A3B.gguf"));

    expect(spec.projectorCandidates).toBeUndefined();
  });

  it("reads a converter's draft name too", () => {
    const spec = buildHfModelSpec(VISION_REPO, file("model-assistant.gguf"));

    expect(spec.supportsVision).toBe(false);
  });

  it("leaves a chat model that merely contains the word alone", () => {
    // "openassistant-…" is a real chat family, not a draft.
    const spec = buildHfModelSpec(VISION_REPO, file("openassistant-3.5d.gguf"));

    expect(spec.supportsVision).toBe(true);
  });

  it("does not read a mid-name MTP as the publisher convention", () => {
    const spec = buildHfModelSpec(
      VISION_REPO,
      file("Qwen3-30B-MTP-Q4_K_M.gguf"),
    );

    expect(spec.supportsVision).toBe(true);
  });
});
