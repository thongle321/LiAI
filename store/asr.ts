/** Voice-input (ASR) capture state — ported from PocketPal's ASRStore.
 *
 * Persisted prefs (`userASROverride`, `selectedTier`, `spokenLanguage`)
 * ride Zustand's `persist` middleware over AsyncStorage; `skipHydration`
 * keeps cold-start discipline, and `load()` rehydrates THEN derives the
 * runtime gate (`deviceSupported` → `asrAvailable`) and per-tier install
 * state from disk — PocketPal's `init()`, idempotent. Backgrounding frees
 * the idle whisper context; the engine seam is injected so plain-Node
 * suites never pull whisper.rn.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { Paths } from "expo-file-system";

import { dedupedStorage, toStateStorage } from "@/services/storage/persist-helpers";
import type { KeyValueStorage } from "@/services/storage/storage";
import {
  activeChatModelBytes,
  deviceSupportedFor,
  fitsCaptureMemory,
} from "@/services/asr/availability.ts";
import type { AsrEngine } from "@/services/asr/types.ts";
import {
  ASR_ANDROID_RAM_SHARE,
  ASR_DEFAULT_TIER,
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_IOS_CEILING_SHARE,
  ASR_LEVEL_HISTORY,
  ASR_TIER_ORDER,
  ASR_TIERS,
} from "@/services/asr/constants.ts";
import type {
  AsrDownloadState,
  AsrErrorKind,
  AsrTier,
  CaptureState,
} from "@/services/asr/types.ts";

export const ASR_KEY = "liai_asr";

/** Engine seam + the device readings the gates need. Injected by the
 *  caller: the app singleton wires the real whisper engine and platform
 *  reads lazily so this module stays plain-Node importable; suites pass
 *  fakes. */
export interface AsrDeps {
  engine(): Promise<AsrEngine>;
  platform(): Promise<"ios" | "android">;
  readMemory(): Promise<number | null>;
  readFreeDisk(): Promise<number | null>;
  /** Backgrounds arrive through here; the default bridges AppState. */
  watchAppState(onBackground: () => void): () => void;
}

interface AsrPersisted {
  userASROverride: boolean | null;
  selectedTier: AsrTier;
  spokenLanguage: string | null;
}

function isAsrTier(v: unknown): v is AsrTier {
  return v === "base" || v === "small" || v === "large-turbo";
}

function normalizeAsrPrefs(raw: unknown): AsrPersisted {
  const fallback: AsrPersisted = {
    userASROverride: null,
    selectedTier: ASR_DEFAULT_TIER,
    spokenLanguage: null,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const r = raw as Record<string, unknown>;
  return {
    userASROverride: r.userASROverride === true || r.userASROverride === false
      ? r.userASROverride
      : null,
    selectedTier: isAsrTier(r.selectedTier) ? r.selectedTier : ASR_DEFAULT_TIER,
    spokenLanguage: typeof r.spokenLanguage === "string" ? r.spokenLanguage : null,
  };
}

export interface AsrState extends AsrPersisted {
  /** Derived at load(): the device clears the ASR tier floor. */
  deviceSupported: boolean;
  /** Override wins, else the device verdict (PocketParity gate). */
  asrAvailable: boolean;
  loaded: boolean;
  captureState: CaptureState;
  /** When the current capture began: the bar's elapsed timer t0.
   *  Cleared with every reset (PocketParity recordingStartedAt). */
  recordingStartedAt: number | null;
  inputLevels: number[];
  chatBusyOnCpu: boolean;
  waitingForChat: boolean;
  error: AsrErrorKind | null;
  isSelectedTierReady: boolean;
  downloadStates: Record<AsrTier, AsrDownloadState>;
  downloadProgress: Record<AsrTier, number>;
  downloadError: Record<AsrTier, string | null>;
  freeDiskBytes: number | null;

  load: () => Promise<void>;
  setUserASROverride: (override: boolean | null) => void;
  setSelectedTier: (tier: AsrTier) => void;
  setCaptureState: (s: CaptureState) => void;
  pushInputLevel: (level: number) => void;
  resetCapture: () => void;
  setError: (kind: AsrErrorKind) => void;
  setSpokenLanguage: (lang: string | null) => void;
  setWaitingForChat: (v: boolean) => void;
  setChatBusyOnCpu: (v: boolean) => void;
  hasMemoryForCapture: () => Promise<boolean>;
  downloadModel: (tier: AsrTier) => Promise<void>;
  deleteModel: (tier: AsrTier) => Promise<void>;
}

interface AsrStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => AsrState;
  setState: (partial: Partial<AsrState>) => void;
}

const initialDownloadStates = (): Record<AsrTier, AsrDownloadState> => ({
  base: "not_installed",
  small: "not_installed",
  "large-turbo": "not_installed",
});
const initialProgress = (): Record<AsrTier, number> => ({
  base: 0,
  small: 0,
  "large-turbo": 0,
});
const initialErrors = (): Record<AsrTier, string | null> => ({
  base: null,
  small: null,
  "large-turbo": null,
});

export function createAsrStore(storage: KeyValueStorage, deps: AsrDeps) {
  let hydrating: Promise<void> | null = null;
  let api: AsrStoreApi | null = null;
  let unwatchBackground: (() => void) | null = null;

  const created = create<AsrState>()(
    persist(
      (set, get) => {
        async function refreshTierReadiness(): Promise<void> {
          const tier = get().selectedTier;
          try {
            const installed = await (await deps.engine()).isInstalled(tier);
            if (get().selectedTier === tier) set({ isSelectedTierReady: installed });
          } catch {
            if (get().selectedTier === tier) set({ isSelectedTierReady: false });
          }
        }

        return {
          userASROverride: null,
          selectedTier: ASR_DEFAULT_TIER,
          spokenLanguage: null,
          deviceSupported: true,
          asrAvailable: true,
          loaded: false,
          captureState: "idle",
  recordingStartedAt: null,
          inputLevels: [],
          chatBusyOnCpu: false,
          waitingForChat: false,
          error: null,
          isSelectedTierReady: false,
          downloadStates: initialDownloadStates(),
          downloadProgress: initialProgress(),
          downloadError: initialErrors(),
          freeDiskBytes: null,

          load: async () => {
            if (get().loaded) return;
            hydrating ??= (async () => {
              if (!api) return;
              try {
                await api.persist.rehydrate();
              } catch {
                // Corrupt/unreadable blob: keep defaults.
              }
              const carried = normalizeAsrPrefs({
                userASROverride: get().userASROverride,
                selectedTier: get().selectedTier,
                spokenLanguage: get().spokenLanguage,
              });
              // PocketParity gate: override wins, else the device verdict.
              const deviceSupported = deviceSupportedFor(await deps.readMemory());
              const asrAvailable = carried.userASROverride ?? deviceSupported;
              set({ ...carried, deviceSupported, asrAvailable, loaded: true });
              // PocketParity init(): per-tier install state derives from
              // disk, and backgrounding frees the idle whisper context.
              for (const tier of ASR_TIER_ORDER) {
                try {
                  const installed = await (await deps.engine()).isInstalled(tier);
                  set((st) => ({
                    downloadStates: {
                      ...st.downloadStates,
                      [tier]: installed ? "ready" : "not_installed",
                    },
                  }));
                } catch {
                  // Unreadable disk: leave not_installed; download re-checks.
                }
              }
              await refreshTierReadiness();
              if (!unwatchBackground) {
                unwatchBackground = deps.watchAppState(() => {
                  // Only 'background' (not 'inactive'): PocketParity rule.
                  if (get().captureState === "idle") {
                    void (async () => {
                      try {
                        await (await deps.engine()).release();
                      } catch {
                        // Engine already gone — nothing to free.
                      }
                    })();
                  }
                });
              }
            })().finally(() => {
              hydrating = null;
            });
            await hydrating;
          },

          setUserASROverride: (override) => {
            set({ userASROverride: override, asrAvailable: override ?? get().deviceSupported });
          },
          setSelectedTier: (tier) => {
            set({ selectedTier: tier });
            void refreshTierReadiness();
          },
          setCaptureState: (s) =>
            set(
              s === "recording"
                ? { captureState: s, recordingStartedAt: Date.now() }
                : { captureState: s },
            ),
          pushInputLevel: (level) =>
            set((st) => ({
              inputLevels: [...st.inputLevels.slice(-(ASR_LEVEL_HISTORY - 1)), level],
            })),
          resetCapture: () =>
            set({
              captureState: "idle",
              inputLevels: [],
              error: null,
              waitingForChat: false,
              recordingStartedAt: null,
            }),
          setError: (kind) => set({ captureState: "error", error: kind }),
          setSpokenLanguage: (lang) => set({ spokenLanguage: lang }),
          setWaitingForChat: (v) => set({ waitingForChat: v }),
          setChatBusyOnCpu: (v) => set({ chatBusyOnCpu: v }),
          hasMemoryForCapture: async () => {
            // PocketParity: whisper runtime must fit NEXT TO the loaded
            // chat model, against TOTAL RAM (free-memory is untrusted).
            return fitsCaptureMemory({
              platform: await deps.platform(),
              totalMemoryBytes: await deps.readMemory(),
              loadedChatBytes: await activeChatModelBytes(),
              runtimeBytes: ASR_TIERS[get().selectedTier].runtimeBytes,
              androidShare: ASR_ANDROID_RAM_SHARE,
              iosShare: ASR_IOS_CEILING_SHARE,
            });
          },
          downloadModel: async (tier) => {
            set((st) => ({
              downloadStates: { ...st.downloadStates, [tier]: "downloading" },
              downloadProgress: { ...st.downloadProgress, [tier]: 0 },
              downloadError: { ...st.downloadError, [tier]: null },
            }));
            try {
              // PocketParity: a pre-versioning install blocks the versioned
              // layout, so reclaim it first; then the disk preflight.
              try {
                await (await deps.engine()).reclaimLegacySpace(tier);
              } catch {
                // Nothing legacy on disk — reclaim is best-effort.
              }
              const free = await deps.readFreeDisk();
              set({ freeDiskBytes: free });
              // SAFETY: the manifest's estimated bytes are real number data
              // from the constants table, so the product below is finite.
              if (free === null || free < ASR_TIERS[tier].estimatedBytes * ASR_DISK_HEADROOM_FACTOR) {
                throw ASR_INSUFFICIENT_STORAGE;
              }
              await (await deps.engine()).downloadModel(tier, (p) => {
                set((st) => ({
                  downloadProgress: { ...st.downloadProgress, [tier]: p },
                }));
              });
              set((st) => ({
                downloadStates: { ...st.downloadStates, [tier]: "ready" },
                downloadProgress: { ...st.downloadProgress, [tier]: 1 },
              }));
              await refreshTierReadiness();
            } catch (err) {
              set((st) => ({
                downloadStates: { ...st.downloadStates, [tier]: "error" },
                downloadError: {
                  ...st.downloadError,
                  [tier]: err === ASR_INSUFFICIENT_STORAGE
                    ? ASR_INSUFFICIENT_STORAGE
                    : String(err),
                },
              }));
            }
          },
          deleteModel: async (tier) => {
            await (await deps.engine()).deleteModel(tier);
            set((st) => {
              const states = { ...st.downloadStates, [tier]: "not_installed" as const };
              // PocketParity: if the removed tier was selected, fall back
              // to the next READY tier (default otherwise).
              let selectedTier = st.selectedTier;
              if (tier === st.selectedTier) {
                selectedTier =
                  ASR_TIER_ORDER.find((t) => t !== tier && states[t] === "ready") ??
                  ASR_DEFAULT_TIER;
              }
              return {
                downloadStates: states,
                downloadProgress: { ...st.downloadProgress, [tier]: 0 },
                selectedTier,
              };
            });
            await refreshTierReadiness();
          },
        };
      },
      {
        name: ASR_KEY,
        storage: createJSONStorage(() => toStateStorage(dedupedStorage(storage))),
        skipHydration: true,
        partialize: (state) => ({
          userASROverride: state.userASROverride,
          selectedTier: state.selectedTier,
          spokenLanguage: state.spokenLanguage,
        }),
        merge: (persistedState, currentState) => {
          const validated = normalizeAsrPrefs(persistedState);
          return { ...currentState, ...validated, loaded: currentState.loaded };
        },
        onRehydrateStorage: () => (state) => {
          if (state) api?.setState({ loaded: true });
        },
      },
    ),
  );

  // SAFETY: the persist middleware returns the same store handle with its
  // own added properties; the runtime shape satisfies AsrStoreApi's three
  // members, which TS cannot see through the middleware's generic.
  api = created as unknown as AsrStoreApi;
  return created;
}

async function freeDiskBytes(): Promise<number | null> {
  try {
    // A number property on the Paths namespace, not a method.
    return typeof Paths.availableDiskSpace === "number" ? Paths.availableDiskSpace : null;
  } catch {
    return null;
  }
}

/** App singleton: AsyncStorage prefs + the real whisper engine seam.
 *  Engine stays a dynamic import (the one seam a plain-Node suite must
 *  not pull); platform/app-state are static — jest and RN natives. */
export const useAsrStore = createAsrStore(
  {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  },
  {
    engine: async () => (await import("@/services/asr/index.ts")).whisperAsrEngine,
    platform: async () => (Platform.OS === "ios" ? "ios" : "android"),
    readMemory: async () => (await import("@/services/models/device-tiers.ts")).readTotalMemory(),
    readFreeDisk: freeDiskBytes,
    watchAppState: (onBackground) => {
      const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
        if (next === "background") onBackground();
      });
      return () => sub.remove();
    },
  },
);

export const asrStore = {
  get state() {
    return useAsrStore.getState();
  },
  get captureState() {
    return useAsrStore.getState().captureState;
  },
  get asrAvailable() {
    return useAsrStore.getState().asrAvailable;
  },
  get isSelectedTierReady() {
    return useAsrStore.getState().isSelectedTierReady;
  },
  get selectedTier() {
    return useAsrStore.getState().selectedTier;
  },
  get spokenLanguage() {
    return useAsrStore.getState().spokenLanguage;
  },
  get waitingForChat() {
    return useAsrStore.getState().waitingForChat;
  },
  get chatBusyOnCpu() {
    return useAsrStore.getState().chatBusyOnCpu;
  },
  get downloadStates() {
    return useAsrStore.getState().downloadStates;
  },
  setCaptureState: (s: CaptureState) => useAsrStore.getState().setCaptureState(s),
  resetCapture: () => useAsrStore.getState().resetCapture(),
  setError: (kind: AsrErrorKind) => useAsrStore.getState().setError(kind),
  setSpokenLanguage: (lang: string | null) => useAsrStore.getState().setSpokenLanguage(lang),
  setWaitingForChat: (v: boolean) => useAsrStore.getState().setWaitingForChat(v),
  pushInputLevel: (l: number) => useAsrStore.getState().pushInputLevel(l),
  setChatBusyOnCpu: (v: boolean) => useAsrStore.getState().setChatBusyOnCpu(v),
  hasMemoryForCapture: () => useAsrStore.getState().hasMemoryForCapture(),
};
