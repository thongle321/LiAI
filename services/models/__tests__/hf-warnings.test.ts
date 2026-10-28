/** hfFileWarnings contract — the download warnings a HF file row shows.
 *
 * PocketParity (ModelFileCard.tsx:119-144): the memory chip is the
 * memory-FIT verdict for this device, so a small model whose footprint is
 * within the device's learned headroom never warns. The learned ceiling
 * carries 1.5x headroom (the same rule the load guard applies), and
 * nothing learned yet is silence, not a warning.
 */

import { hfFileWarnings } from "../hf-warnings";

const GIB = 1024 * 1024 * 1024;

describe("hfFileWarnings memory rule", () => {
  it("a file within the learned ceiling's headroom does not warn", () => {
    const warnings = hfFileWarnings({
      fileName: "small-model-Q4_K_M.gguf",
      requiredBytes: 1.2 * GIB,
      isVision: false,
      hasProjector: false,
      freeBytes: null,
      learnedCeilingBytes: GIB,
    });
    expect(warnings.map((w) => w.code)).not.toContain("short-memory");
  });

  it("warns only beyond the learned ceiling", () => {
    const warnings = hfFileWarnings({
      fileName: "big-model-Q4_K_M.gguf",
      requiredBytes: 2 * GIB,
      isVision: false,
      hasProjector: false,
      freeBytes: null,
      learnedCeilingBytes: GIB,
    });
    expect(warnings).toEqual([
      { code: "short-memory", label: "Memory tight" },
    ]);
  });

  it("a file at exactly the learned ceiling does not warn", () => {
    const warnings = hfFileWarnings({
      fileName: "equal-model-Q4_K_M.gguf",
      requiredBytes: GIB,
      isVision: false,
      hasProjector: false,
      freeBytes: null,
      learnedCeilingBytes: GIB,
    });
    expect(warnings.map((w) => w.code)).not.toContain("short-memory");
  });

  it("nothing learned yet is silence, not a warning", () => {
    const warnings = hfFileWarnings({
      fileName: "first-model-Q4_K_M.gguf",
      requiredBytes: 50 * GIB,
      isVision: false,
      hasProjector: false,
      freeBytes: null,
      learnedCeilingBytes: 0,
    });
    expect(warnings).toEqual([]);
  });
});

describe("hfFileWarnings other rules", () => {
  it("a fuller-than-free disk warns Not enough space", () => {
    const warnings = hfFileWarnings({
      fileName: "model.gguf",
      requiredBytes: 2 * GIB,
      isVision: false,
      hasProjector: false,
      freeBytes: GIB,
      learnedCeilingBytes: 0,
    });
    expect(warnings).toEqual([
      { code: "not-enough-space", label: "Not enough space" },
    ]);
  });

  it("unreadable free space is not a block", () => {
    const warnings = hfFileWarnings({
      fileName: "model.gguf",
      requiredBytes: 2 * GIB,
      isVision: false,
      hasProjector: false,
      freeBytes: null,
      learnedCeilingBytes: 0,
    });
    expect(warnings).toEqual([]);
  });
});
