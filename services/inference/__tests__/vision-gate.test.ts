
import { readSource } from "@/jest/source";

import { specCanSeeImages } from "../mmproj";

// vision-series 03: the attach affordance follows the SAME capability rule
// the send gate and the engine load use — disabled-with-hint when the
// active model cannot see, enabled when it can, live on model switch.

const specs = [
  {
    id: "v1",
    downloadStatus: "completed",
    projector: { name: "mmproj-v-f16.gguf", size: 90, downloadUrl: "u2" },
  },
  { id: "t1", downloadStatus: "completed" },
  {
    id: "half",
    downloadStatus: "downloading",
    projector: { name: "mmproj-h.gguf", size: 1, downloadUrl: "u" },
  },
] as const;

describe("specCanSeeImages", () => {
  it("is true for a completed local vision pair", () => {
    expect(specCanSeeImages(specs, "v1", "local")).toEqual(true);
  });

  it("is false for every cannot-see case", () => {
    expect(specCanSeeImages(specs, "t1", "local")).toEqual(false);
    expect(specCanSeeImages(specs, "half", "local")).toEqual(false);
    expect(specCanSeeImages(specs, "v1", "remote")).toEqual(false);
    expect(specCanSeeImages(specs, null, "local")).toEqual(false);
  });
});

describe("the composer gates the attach affordance on it", () => {
  it("the hook reads the SAME rule, synchronously", () => {
    const src = readSource("hooks/useMultimodalAvailable.ts");
    expect(src).toMatch(/canSeeImages/);
    expect(src).toMatch(/useModelStore/);
  });

  it("the plus button is always rendered, disabled-with-hint when blind", () => {
    const src = readSource("components/chat/message-input.tsx");
    expect(src).toMatch(/useMultimodalAvailable/);
    // The disabled STATE stays (a11y state + grey glyph), but `disabled` is
    // not set: a gated press must answer with the cannot-see helper line,
    // same rule as the G9 send gate.
    expect(src).toMatch(
      /accessibilityState=\{\{ disabled: !modelReady \|\| !canSee \}\}/,
    );
    expect(src).toMatch(/setHelperNote\(plusBlockedHint\)/);
    expect(src).toMatch(/"This model can't see images"/);
  });
});
