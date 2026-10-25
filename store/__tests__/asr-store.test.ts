/** ASR store parity (PocketPal ASRStore): override-wins gate, memory
 *  gate wiring, disk-derived install state, download preflight, delete
 *  reselection, background release, and persisted prefs. */

import {
  ASR_DEFAULT_TIER,
  ASR_INSUFFICIENT_STORAGE,
  ASR_TIERS,
} from "@/services/asr/constants.ts";
import type { AsrDownloadState, AsrEngine, AsrTier } from "@/services/asr/types.ts";
import { createAsrStore, ASR_KEY, setupTierFor } from "../asr";
import { memoryStorage } from "@/jest/storage";

function fakeEngine(over: Partial<AsrEngine> = {}): AsrEngine {
  return {
    isInstalled: async () => false,
    downloadModel: async () => {},
    deleteModel: async () => {},
    reclaimLegacySpace: async () => {},
    preload: async () => {},
    transcribe: async () => ({ text: "", language: "en" }),
    cancelTranscription: async () => {},
    release: async () => {},
    ...over,
  };
}

function deps(over: Partial<Parameters<typeof createAsrStore>[1]> = {}) {
  let background: (() => void) | null = null;
  const defaults = {
    engine: async () => fakeEngine(),
    platform: async (): Promise<"android"> => "android",
    readMemory: async (): Promise<number | null> => 8_000_000_000,
    readFreeDisk: async (): Promise<number | null> => 10_000_000_000,
    watchAppState: (onBackground: () => void) => {
      background = onBackground;
      return () => {
        background = null;
      };
    },
  };
  return { deps: { ...defaults, ...over }, triggerBackground: () => background?.() };
}

describe("availability gate (device tier × override)", () => {
  it("derives deviceSupported from RAM at load and asrAvailable follows", async () => {
    const { deps: d } = deps({ readMemory: async () => 2_000_000_000 });
    const useStore = createAsrStore(memoryStorage(), d);
    await useStore.getState().load();
    expect(useStore.getState().deviceSupported).toBe(false);
    expect(useStore.getState().asrAvailable).toBe(false); // no override yet
  });

  it("admits a tier-floor device by default (PocketParity 'high' intent)", async () => {
    const { deps: d } = deps({ readMemory: async () => 8_000_000_000 });
    const useStore = createAsrStore(memoryStorage(), d);
    await useStore.getState().load();
    expect(useStore.getState().asrAvailable).toBe(true);
  });

  it("override wins both ways and persists (tristate)", async () => {
    const storage = memoryStorage();
    const { deps: d } = deps({ readMemory: async () => 4_000_000_000 });
    const useStore = createAsrStore(storage, d);
    await useStore.getState().load();

    // Supported device, user turns voice input OFF.
    useStore.getState().setUserASROverride(false);
    expect(useStore.getState().asrAvailable).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(storage.data[ASR_KEY]).state.userASROverride).toBe(false);

    // A NEW store instance hydrates the override and it still wins.
    const again = createAsrStore(storage, d);
    await again.getState().load();
    expect(again.getState().asrAvailable).toBe(false);

    // Explicit ON beats an unsupported device too.
    again.getState().setUserASROverride(true);
    expect(again.getState().asrAvailable).toBe(true);

    // Reset to null → back to the device verdict.
    again.getState().setUserASROverride(null);
    expect(again.getState().asrAvailable).toBe(again.getState().deviceSupported);
  });
});

describe("hasMemoryForCapture", () => {
  it("feeds the whisper runtime for the SELECTED tier against the chat load", async () => {
    const { deps: d } = deps({
      // Small's 650 MB + a 2.6 GB chat model against 0.45 × 6 GB = 2.7 GB.
      readMemory: async () => 6_000_000_000,
    });
    const useStore = createAsrStore(memoryStorage(), d);
    await useStore.getState().load();
    // activeChatModelBytes resolves the real model store lazily; in tests
    // no local model is active → 0 chat bytes → small fits easily.
    expect(await useStore.getState().hasMemoryForCapture()).toBe(true);
  });
});

describe("download preflight (PocketParity disk rule)", () => {
  it("refuses when free disk < estimated × headroom, with the token error", async () => {
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        readFreeDisk: async () => ASR_TIERS.base.estimatedBytes * 1.1, // < 1.2×
      }).deps,
    );
    await useStore.getState().load();
    await useStore.getState().downloadModel("base");
    const s = useStore.getState();
    expect(s.downloadStates.base).toBe("error");
    expect(s.downloadError.base).toBe(ASR_INSUFFICIENT_STORAGE);
    expect(s.freeDiskBytes).toBe(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      ASR_TIERS.base.estimatedBytes * 1.1,
    );
  });

  it("downloads and marks ready when the disk clears the headroom", async () => {
    const progress: number[] = [];
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        readFreeDisk: async () => 10_000_000_000,
        engine: async () =>
          fakeEngine({
            downloadModel: async (_tier, onProgress) => {
              onProgress?.(0.5);
              progress.push(0.5);
            },
          }),
      }).deps,
    );
    await useStore.getState().load();
    await useStore.getState().downloadModel("small");
    const s = useStore.getState();
    expect(s.downloadStates.small).toBe("ready");
    expect(s.downloadProgress.small).toBe(1);
    expect(progress).toEqual([0.5]);
  });

  it("a failed download re-checks readiness for the selected tier", async () => {
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        readFreeDisk: async () => 1_000, // everything blocked
      }).deps,
    );
    await useStore.getState().load(); // nothing installed → not ready
    await useStore.getState().downloadModel("small");
    expect(useStore.getState().downloadStates.small).toBe("error");
    expect(useStore.getState().isSelectedTierReady).toBe(false);
  });
});

describe("tier selection policy (#1017: one model in use)", () => {
  /** Nothing installed at load; the engine adds tiers as they download. */
  function installingStore(storage = memoryStorage()) {
    const installed = new Set<AsrTier>();
    const useStore = createAsrStore(
      storage,
      deps({
        engine: async () =>
          fakeEngine({
            isInstalled: async (tier) => installed.has(tier),
            downloadModel: async (tier) => void installed.add(tier),
            deleteModel: async (tier) => void installed.delete(tier),
          }),
      }).deps,
    );
    return { useStore, installed };
  }

  it("defaults to base (PocketParity: fast on every measured phone)", async () => {
    const { useStore } = installingStore();
    await useStore.getState().load();
    expect(ASR_DEFAULT_TIER).toBe("base");
    expect(useStore.getState().selectedTier).toBe("base");
  });

  it("the FIRST install becomes the in-use tier; later ones do not switch it", async () => {
    const { useStore } = installingStore();
    await useStore.getState().load();
    await useStore.getState().downloadModel("base");
    expect(useStore.getState().selectedTier).toBe("base");
    expect(useStore.getState().isSelectedTierReady).toBe(true);

    // Small finishes while base is already in use: base stays.
    await useStore.getState().downloadModel("small");
    expect(useStore.getState().downloadStates.small).toBe("ready");
    expect(useStore.getState().selectedTier).toBe("base");
  });

  it("selectTier switches only to a READY tier", async () => {
    const { useStore } = installingStore();
    await useStore.getState().load();
    await useStore.getState().downloadModel("base");

    // Not installed: the press does nothing.
    useStore.getState().selectTier("small");
    expect(useStore.getState().selectedTier).toBe("base");

    // Installed: the switch commits.
    await useStore.getState().downloadModel("small");
    useStore.getState().selectTier("small");
    expect(useStore.getState().selectedTier).toBe("small");
    expect(useStore.getState().isSelectedTierReady).toBe(true);
  });

  it("a download already in flight is left alone (re-entrant guard)", async () => {
    let downloads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        readFreeDisk: async () => 10_000_000_000,
        engine: async () =>
          fakeEngine({
            isInstalled: async () => false,
            downloadModel: async () => {
              downloads += 1;
              await gate;
            },
          }),
      }).deps,
    );
    await useStore.getState().load();
    const first = useStore.getState().downloadModel("base");
    await useStore.getState().downloadModel("base"); // no-op
    release();
    await first;
    expect(downloads).toBe(1);
    expect(useStore.getState().downloadStates.base).toBe("ready");
  });

  it("deleteModel ignores a tier that is downloading", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        readFreeDisk: async () => 10_000_000_000,
        engine: async () =>
          fakeEngine({
            isInstalled: async () => false,
            downloadModel: async () => {
              await gate;
            },
            deleteModel: async () => {},
          }),
      }).deps,
    );
    await useStore.getState().load();
    const download = useStore.getState().downloadModel("base");
    await useStore.getState().deleteModel("base"); // ignored
    expect(useStore.getState().downloadStates.base).toBe("downloading");
    release();
    await download;
  });

  it("retryDownload re-attempts a failed tier (PocketParity retry)", async () => {
    let fail = true;
    const installed = new Set<AsrTier>();
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        readFreeDisk: async () => (fail ? 0 : 10_000_000_000),
        engine: async () =>
          fakeEngine({
            isInstalled: async (tier) => installed.has(tier),
            downloadModel: async (tier) => void installed.add(tier),
          }),
      }).deps,
    );
    await useStore.getState().load();
    await useStore.getState().downloadModel("base");
    expect(useStore.getState().downloadStates.base).toBe("error");

    fail = false;
    await useStore.getState().retryDownload("base");
    expect(useStore.getState().downloadStates.base).toBe("ready");
    expect(useStore.getState().selectedTier).toBe("base"); // first install
  });
});

describe("setupTier (the tier a setup sheet offers)", () => {
  it("is the in-use tier once ready, else the default — never a stale one", () => {
    const none: Record<AsrTier, AsrDownloadState> = {
      base: "not_installed",
      small: "not_installed",
      "large-turbo": "not_installed",
    };
    expect(setupTierFor("small", none)).toBe("base"); // stale small
    const baseReady = { ...none, base: "ready" as const };
    expect(setupTierFor("small", baseReady)).toBe("base");
    const smallReady = { ...none, small: "ready" as const };
    expect(setupTierFor("small", smallReady)).toBe("small");
  });
});

describe("installing the first tier selects it (PocketParity)", () => {
  it("makes the downloaded tier the selected, ready one", async () => {
    const installed = new Set<AsrTier>();
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        engine: async () =>
          fakeEngine({
            isInstalled: async (tier) => installed.has(tier),
            downloadModel: async (tier) => void installed.add(tier),
          }),
      }).deps,
    );
    await useStore.getState().load();
    // Nothing installed yet: the selection is the DEFAULT tier (base).
    expect(useStore.getState().selectedTier).toBe(ASR_DEFAULT_TIER);

    await useStore.getState().downloadModel("base");
    expect(useStore.getState().selectedTier).toBe("base");
    expect(useStore.getState().downloadStates.base).toBe("ready");
    expect(useStore.getState().isSelectedTierReady).toBe(true);
  });
});

describe("deleteModel reselection (PocketParity fallback)", () => {
  it("falls back to the next READY tier when the selected one is deleted", async () => {
    const installed = new Set<AsrTier>(["base", "large-turbo"]);
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        engine: async () =>
          fakeEngine({
            isInstalled: async (tier) => installed.has(tier),
          }),
      }).deps,
    );
    await useStore.getState().load();
    // Nothing selects a missing tier: start from the default, then pick.
    useStore.getState().selectTier("large-turbo");
    await new Promise((r) => setTimeout(r, 0));
    expect(useStore.getState().isSelectedTierReady).toBe(true);

    await useStore.getState().deleteModel("large-turbo");
    installed.delete("large-turbo");
    expect(useStore.getState().selectedTier).toBe("base"); // next ready
    expect(useStore.getState().downloadStates["large-turbo"]).toBe("not_installed");
  });

  it("falls back to the DEFAULT tier when no other is ready", async () => {
    const installed = new Set<AsrTier>(["small"]);
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        engine: async () =>
          fakeEngine({ isInstalled: async (tier) => installed.has(tier) }),
      }).deps,
    );
    await useStore.getState().load();
    // Reconcile keeps the only installed tier in use; deleting it then
    // falls back to the DEFAULT (base), with nothing ready.
    expect(useStore.getState().selectedTier).toBe("small");
    await useStore.getState().deleteModel("small");
    expect(useStore.getState().selectedTier).toBe(ASR_DEFAULT_TIER); // fallback target
  });
});

describe("backgrounded release (PocketParity: background only, idle only)", () => {
  it("releases the whisper engine when backgrounded at idle", async () => {
    let released = 0;
    const { deps: d, triggerBackground } = deps({
      engine: async () =>
        fakeEngine({ release: async () => void (released += 1) }),
    });
    const useStore = createAsrStore(memoryStorage(), d);
    await useStore.getState().load();
    triggerBackground();
    await new Promise((r) => setTimeout(r, 0));
    expect(released).toBe(1);
  });
});

describe("loading derives disk install state (PocketParity init)", () => {
  it("marks installed tiers ready and selects the installed one", async () => {
    const installed = new Set<AsrTier>(["base"]);
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        engine: async () =>
          fakeEngine({ isInstalled: async (tier) => installed.has(tier) }),
      }).deps,
    );
    await useStore.getState().load();
    expect(useStore.getState().downloadStates.base).toBe("ready");
    expect(useStore.getState().downloadStates.small).toBe("not_installed");
    expect(useStore.getState().downloadStates["large-turbo"]).toBe("not_installed");
    // The default (small) is absent, so the installed base wins.
    expect(useStore.getState().selectedTier).toBe("base");
    expect(useStore.getState().isSelectedTierReady).toBe(true);
  });

  it("repairs a persisted selection whose tier is no longer installed", async () => {
    const installed = new Set<AsrTier>(["base"]);
    const storage = memoryStorage();
    storage.data[ASR_KEY] = JSON.stringify({
      state: { userASROverride: null, selectedTier: "small", spokenLanguage: null },
      version: 0,
    });
    const useStore = createAsrStore(
      storage,
      deps({
        engine: async () =>
          fakeEngine({ isInstalled: async (tier) => installed.has(tier) }),
      }).deps,
    );
    await useStore.getState().load();
    expect(useStore.getState().selectedTier).toBe("base");
    expect(useStore.getState().isSelectedTierReady).toBe(true);
  });

  it("leaves the selection alone when no tier is installed", async () => {
    const useStore = createAsrStore(memoryStorage(), deps().deps);
    await useStore.getState().load();
    expect(useStore.getState().selectedTier).toBe(ASR_DEFAULT_TIER);
    expect(useStore.getState().isSelectedTierReady).toBe(false);
  });

  it("load() is idempotent", async () => {
    let watched = 0;
    const { deps: d } = deps({
      watchAppState: (cb) => {
        watched += 1;
        void cb;
        return () => {};
      },
    });
    const useStore = createAsrStore(memoryStorage(), d);
    await useStore.getState().load();
    await useStore.getState().load();
    expect(watched).toBe(1);
  });
});

describe("switching tiers", () => {
  it("selects a different installed tier", async () => {
    const installed = new Set<AsrTier>(["base", "small"]);
    const useStore = createAsrStore(
      memoryStorage(),
      deps({
        engine: async () =>
          fakeEngine({ isInstalled: async (tier) => installed.has(tier) }),
      }).deps,
    );
    await useStore.getState().load();
    // The default is installed, so it stays selected.
    expect(useStore.getState().selectedTier).toBe(ASR_DEFAULT_TIER);

    useStore.getState().selectTier("base");
    expect(useStore.getState().selectedTier).toBe("base");

    useStore.getState().selectTier("small");
    expect(useStore.getState().selectedTier).toBe("small");
  });
});
