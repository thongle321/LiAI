/** The one vision-capability verdict (services/inference/mmproj.ts) —
 *  pure decision tests. The hook wiring that reads it live is covered in
 *  hooks/__tests__/useMultimodalAvailable.test.ts.
 *
 *  cannotSeeKind is the HUD's card picker: when the active setup cannot
 *  see, it must say WHY — and the reason must be derived from the same
 *  records canSeeImages reads, so a screen can never split differently
 *  from the send gate.
 */

import type { ModelSpec } from "@/types/models.ts";
import {
  canSeeImages,
  cannotSeeKind,
  type ModelCapabilityState,
} from "../mmproj.ts";

const FILE = {
  name: "gemma.gguf",
  size: 999,
  downloadUrl: "https://example.com/gemma.gguf",
};
const MMPROJ = {
  name: "mmproj.gguf",
  size: 999,
  downloadUrl: "https://example.com/mmproj.gguf",
};

function model(over: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "m",
    name: "Gemma",
    author: "ggml-org",
    description: "fixture",
    origin: "huggingface",
    type: "vision",
    files: [FILE],
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 999,
    totalBytes: 999,
    ...over,
  };
}

type Seed = {
  models?: ModelSpec[];
  remoteCaps?: Record<string, { supportsVision?: boolean }>;
  activeModelId?: string | null;
  activeProviderType?: "local" | "remote" | null;
};

function state(over: Seed = {}): ModelCapabilityState {
  return {
    models: [model()] as ModelCapabilityState["models"],
    remoteCaps: {},
    activeModelId: "m",
    activeProviderType: "local",
    ...over,
  };
}

describe("canSeeImages", () => {
  it("a completed local pair with vision on can see", () => {
    expect(canSeeImages(state({ models: [model({ projector: MMPROJ })] }))).toBe(
      true,
    );
  });
});

describe("cannotSeeKind", () => {
  it("a seeing setup is 'sees'", () => {
    expect(
      cannotSeeKind(state({ models: [model({ projector: MMPROJ })] })),
    ).toBe("sees");
  });

  it("a completed pair whose flag is off, projector on disk: 'toggledOff'", () => {
    expect(
      cannotSeeKind(
        state({ models: [model({ projector: MMPROJ, visionEnabled: false })] }),
      ),
    ).toBe("toggledOff");
  });

  it("no projector paired: 'noVision'", () => {
    expect(cannotSeeKind(state({ models: [model()] }))).toBe("noVision");
  });

  it("a remote probe without vision: 'noVision'", () => {
    expect(
      cannotSeeKind(
        state({
          models: [],
          activeProviderType: "remote",
          remoteCaps: { srv: {} },
          activeModelId: "remote-srv",
        }),
      ),
    ).toBe("noVision");
  });

  it("no active model at all: 'noVision' (the HUD keeps its own dead state)", () => {
    expect(
      cannotSeeKind(
        state({ models: [], activeModelId: null, activeProviderType: null }),
      ),
    ).toBe("noVision");
  });
});
