import { create } from "zustand";

import {
  ASR_DEFAULT_TIER,
  ASR_TIER_ORDER,
  whisperAsrEngine,
} from "@/services/asr/index.ts";
import type {
  AsrDownloadState,
  AsrTier,
  CaptureState,
} from "@/services/asr/types.ts";

interface AsrState {
  selectedTier: AsrTier;
  spokenLanguage: string | null;
  userASROverride: boolean | null;
  deviceSupported: boolean;
  asrAvailable: boolean;
  captureState: CaptureState;
  inputLevels: number[];
  chatBusyOnCpu: boolean;
  waitingForChat: boolean;
  error: string | null;
  isSelectedTierReady: boolean;
  downloadStates: Record<AsrTier, AsrDownloadState>;
  downloadProgress: Record<AsrTier, number>;
  downloadError: Record<AsrTier, string | null>;
  freeDiskBytes: number | null;

  setCaptureState: (s: CaptureState) => void;
  pushInputLevel: (level: number) => void;
  resetCapture: () => void;
  setError: (kind: string) => void;
  setSpokenLanguage: (lang: string | null) => void;
  setWaitingForChat: (v: boolean) => void;
  setChatBusyOnCpu: (v: boolean) => void;
  hasMemoryForCapture: () => Promise<boolean>;
  downloadModel: (tier: AsrTier) => Promise<void>;
  deleteModel: (tier: AsrTier) => Promise<void>;
}

export const useAsrStore = create<AsrState>((set) => ({
  selectedTier: ASR_DEFAULT_TIER,
  spokenLanguage: null,
  userASROverride: null,
  deviceSupported: true,
  asrAvailable: true,
  captureState: "idle",
  inputLevels: [],
  chatBusyOnCpu: false,
  waitingForChat: false,
  error: null,
  isSelectedTierReady: false,
  downloadStates: { base: "not_installed", small: "not_installed", "large-turbo": "not_installed" },
  downloadProgress: { base: 0, small: 0, "large-turbo": 0 },
  downloadError: { base: null, small: null, "large-turbo": null },
  freeDiskBytes: null,

  setCaptureState: (s) => set({ captureState: s }),
  pushInputLevel: (level) => set((st) => ({ inputLevels: [...st.inputLevels.slice(-39), level] })),
  resetCapture: () => set({ captureState: "idle", inputLevels: [], error: null, waitingForChat: false }),
  setError: (kind) => set({ captureState: "error", error: kind }),
  setSpokenLanguage: (lang) => set({ spokenLanguage: lang }),
  setWaitingForChat: (v) => set({ waitingForChat: v }),
  setChatBusyOnCpu: (v) => set({ chatBusyOnCpu: v }),
  hasMemoryForCapture: async () => true,
  downloadModel: async (tier) => {
    set((st) => ({
      downloadStates: { ...st.downloadStates, [tier]: "downloading" },
      downloadProgress: { ...st.downloadProgress, [tier]: 0 },
      downloadError: { ...st.downloadError, [tier]: null },
    }));
    try {
      await whisperAsrEngine.downloadModel(tier, (p) => {
        set((st) => ({
          downloadProgress: { ...st.downloadProgress, [tier]: p },
        }));
      });
      set((st) => ({
        downloadStates: { ...st.downloadStates, [tier]: "ready" },
        downloadProgress: { ...st.downloadProgress, [tier]: 1 },
      }));
    } catch (err) {
      set((st) => ({
        downloadStates: { ...st.downloadStates, [tier]: "error" },
        downloadError: { ...st.downloadError, [tier]: String(err) },
      }));
    }
  },
  deleteModel: async (tier) => {
    await whisperAsrEngine.deleteModel(tier);
    set((st) => ({
      downloadStates: { ...st.downloadStates, [tier]: "not_installed" },
      downloadProgress: { ...st.downloadProgress, [tier]: 0 },
    }));
  },
}));

export const asrStore = {
  get state() { return useAsrStore.getState(); },
  setCaptureState: (s: CaptureState) => useAsrStore.getState().setCaptureState(s),
  pushInputLevel: (l: number) => useAsrStore.getState().pushInputLevel(l),
  resetCapture: () => useAsrStore.getState().resetCapture(),
  setError: (k: string) => useAsrStore.getState().setError(k),
  setSpokenLanguage: (l: string | null) => useAsrStore.getState().setSpokenLanguage(l),
  setWaitingForChat: (v: boolean) => useAsrStore.getState().setWaitingForChat(v),
  get captureState() { return useAsrStore.getState().captureState; },
  get asrAvailable() { return useAsrStore.getState().asrAvailable; },
  get isSelectedTierReady() { return useAsrStore.getState().isSelectedTierReady; },
  get spokenLanguage() { return useAsrStore.getState().spokenLanguage; },
  get chatBusyOnCpu() { return useAsrStore.getState().chatBusyOnCpu; },
  get selectedTier() { return useAsrStore.getState().selectedTier; },
  hasMemoryForCapture: () => useAsrStore.getState().hasMemoryForCapture(),
  get downloadStates() { return useAsrStore.getState().downloadStates; },
};

void (async () => {
  for (const tier of ASR_TIER_ORDER) {
    const installed = await whisperAsrEngine.isInstalled(tier);
    if (installed) {
      useAsrStore.setState((st) => ({
        downloadStates: { ...st.downloadStates, [tier]: "ready" },
      }));
    }
  }
  const ready = await whisperAsrEngine.isInstalled(useAsrStore.getState().selectedTier);
  useAsrStore.setState({ isSelectedTierReady: ready });
})();
