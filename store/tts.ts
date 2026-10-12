/** Voice-pack state: which engines are installed, downloading, or failed.
 *
 * Not persisted — the filesystem is the source of truth, re-read on init,
 * exactly like PocketPal's TTSStore. Only the user's choices (voice,
 * auto-speak, Supertonic options) are persisted, and those live in
 * store/voice.ts.
 */

import { create } from "zustand";

import {
  deleteEngine,
  downloadEngine,
  isEngineInstalled,
  readFreeBytes,
  type EngineDownloadStatus,
} from "../lib/tts/download.ts";
import { diskPreflightOk } from "../lib/tts/packPlan.ts";
import { DOWNLOADABLE_ENGINES } from "../lib/tts/constants.ts";
import { ttsRuntime } from "../lib/tts/runtime.ts";
import type { EngineId, Voice } from "../lib/tts/types.ts";
import { useVoice } from "./voice.ts";

export type EngineState = "not_installed" | "downloading" | "ready" | "error";

export interface EngineEntry {
  state: EngineState;
  /** 0..1 across both weighted phases. */
  progress: number;
  error?: string;
}

export type EngineMap = Record<EngineId, EngineEntry>;

const PENDING: EngineEntry = { state: "not_installed", progress: 0 };

export interface TtsState {
  engines: EngineMap;
  freeBytes: number | null;
  /** Whether this device is estimated to have the RAM a neural engine needs.
   *  An ESTIMATE, not a measurement — see estimateHasRam. */
  deviceHasRam: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  refreshFreeSpace: () => Promise<void>;
  download: (engine: EngineId) => Promise<void>;
  remove: (engine: EngineId) => Promise<void>;
  /** Voices an engine can currently offer. */
  voicesFor: (engine: EngineId) => Voice[];
}

function emptyMap(): EngineMap {
  return { system: PENDING, kitten: PENDING, kokoro: PENDING, supertonic: PENDING };
}

/**
 * RAM gate. PocketPal measures `getTotalMemory()`; no API in our stack does
 * that without a new dependency, and the agreed trade (N2=d) is to
 * ESTIMATE rather than measure. We have no reliable estimate either — RAM
 * cannot be derived from the model string — so this is permissive.
 *
 * That is the safe direction to be wrong in: offering a pack that runs
 * slowly costs the user a slow voice, while hiding a pack that would have
 * worked costs them a feature they cannot reach. System voice is offered
 * regardless of this answer.
 *
 * If this ever needs to be real, the honest fix is reading /proc/meminfo
 * through RNFS on Android, not a device-model lookup table.
 */
function estimateHasRam(): boolean {
  return true;
}

/** Voice list for an engine, but only once its pack is actually installed. */
function voicesFor(engines: EngineMap, engine: EngineId): Voice[] {
  if (engine === "system") return [];
  if (engines[engine]?.state !== "ready") return [];
  // Imported lazily so the catalog (and its HF URLs) stays out of the
  // module graph of every screen that merely reads voice settings.
  const { ENGINE_VOICES } = require("../lib/tts/catalog.ts") as typeof import("../lib/tts/catalog.ts");
  return ENGINE_VOICES[engine];
}

export const useTts = create<TtsState>()((set, get) => ({
  engines: emptyMap(),
  freeBytes: null,
  deviceHasRam: estimateHasRam(),
  loaded: false,

  load: async () => {
    const entries = { ...emptyMap() };
    for (const engine of DOWNLOADABLE_ENGINES) {
      entries[engine] = (await isEngineInstalled(engine))
        ? { state: "ready", progress: 1 }
        : { state: "not_installed", progress: 0 };
    }
    const current = useVoice.getState().currentVoice;
    // A voice whose pack was deleted must not stay selected — speaking it
    // would fail at the engine. System stays selectable.
    if (current && current.engine !== "system" && entries[current.engine].state !== "ready") {
      useVoice.getState().setVoice(null);
    }
    set({ engines: entries, loaded: true });
    await get().refreshFreeSpace();
  },

  refreshFreeSpace: async () => {
    set({ freeBytes: await readFreeBytes() });
  },

  download: async (engine) => {
    if (get().engines[engine]?.state === "downloading") return;
    const apply = (status: EngineDownloadStatus) =>
      set((s) => ({
        engines: {
          ...s.engines,
          [engine]: { state: status.state, progress: status.progress, ...(status.error ? { error: status.error } : {}) },
        },
      }));
    await downloadEngine(engine, apply);
    await get().refreshFreeSpace();
    // Never auto-select a voice the engine cannot actually speak: only
    // System has an implementation today, so parking the user on a neural
    // voice would replace a working voice with silence. Selection waits
    // until the engine is implemented (or the user picks it knowingly).
    if (get().engines[engine].state === "ready" && !useVoice.getState().currentVoice) {
      const { hasEngine } = await import("../lib/tts/engineRegistry.ts");
      if (hasEngine(engine)) {
        const first = voicesFor(get().engines, engine)[0];
        if (first) useVoice.getState().setVoice(first);
      }
    }
  },

  remove: async (engine) => {
    // Stop and release first: freeing memory under a live model crashes
    // native, and the runtime is the only thing that knows what is loaded.
    await ttsRuntime.stop().catch(() => undefined);
    await ttsRuntime.release().catch(() => undefined);
    await deleteEngine(engine);
    if (useVoice.getState().currentVoice?.engine === engine) {
      useVoice.getState().setVoice(null);
    }
    set((s) => ({ engines: { ...s.engines, [engine]: PENDING } }));
    await get().refreshFreeSpace();
  },

  voicesFor: (engine) => voicesFor(get().engines, engine),
}));

/** Whether an engine can be offered given the disk we can see. */
export function engineBlockedByDisk(freeBytes: number | null, engine: EngineId): boolean {
  return !diskPreflightOk(freeBytes, engine);
}