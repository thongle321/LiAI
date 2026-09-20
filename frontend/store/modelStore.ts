/** Model management Zustand store with AsyncStorage persistence. */

import { create } from "zustand";
import * as FileSystem from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage";
import type {
  ModelSpec,
  ModelSettings,
  PresetModel,
  PresetModelFile,
  HFModelSearchResult,
  HFModelFile,
  RemoteApiProvider,
  ModelDownloadStatus,
} from "../types/models";
import { DEFAULT_MODEL_SETTINGS, parseModelSettings, parseModelSettingsMap } from "../lib/model-settings";
import { buildLocalModelSpec } from "../lib/local-model";
import { modelSourceStrategies, getStrategyById } from "../services/model-strategies";
import { downloadService } from "../services/download";
import { uploadService } from "../services/transfer";

const STORAGE_KEY = "liai_models_v1";
const ACTIVE_MODEL_KEY = "liai_active_model_v1";
const REMOTE_APIS_KEY = "liai_remote_apis_v1";
const HF_TOKEN_KEY = "liai_hf_token_v1";
const MODEL_SETTINGS_KEY = "liai_model_settings_v1";

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

const asyncStorage: KeyValueStorage = {
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
};

export interface ModelState {
  // Model catalog
  models: ModelSpec[];
  presets: PresetModel[];
  remoteApis: RemoteApiProvider[];
  hfToken: string | null;
  modelSettings: Record<string, ModelSettings>;

  // Active selections
  activeModelId: string | null;
  activeProviderType: "local" | "remote" | null;

  // Search state
  searchResults: HFModelSearchResult[];
  searchLoading: boolean;
  searchError: string | null;

  // Download state (mirrored from downloadService)
  activeDownloads: Map<string, ModelDownloadStatus>;

  // Actions
  loadPersisted: () => Promise<void>;
  saveModels: () => Promise<void>;
  saveRemoteApis: () => Promise<void>;
  saveModelSettings: () => Promise<void>;

  // Model management
  addModel: (model: ModelSpec) => void;
  removeModel: (modelId: string) => Promise<void>;
  updateModel: (modelId: string, updates: Partial<ModelSpec>) => void;
  getModel: (modelId: string) => ModelSpec | undefined;

  // Local file import (device file -> models/local/ + register as ready)
  addLocalModel: (sourceUri: string, fileName: string, size: number) => Promise<void>;

  // Presets
  loadPresets: () => Promise<void>;

  // HF Search
  searchModels: (query: string) => Promise<void>;
  getModelFiles: (modelId: string) => Promise<HFModelFile[]>;

  // Downloads
  startDownload: (modelId: string, file: HFModelFile | PresetModelFile, token?: string) => Promise<void>;
  pauseDownload: (jobId: string) => Promise<void>;
  resumeDownload: (jobId: string) => Promise<void>;
  cancelDownload: (jobId: string) => Promise<void>;
  syncDownloadStatus: () => void;

  // Upload to backend
  uploadToBackend: (modelId: string) => Promise<boolean>;

  // Remote API providers
  addRemoteApi: (provider: RemoteApiProvider) => void;
  removeRemoteApi: (providerId: string) => void;
  updateRemoteApi: (providerId: string, updates: Partial<RemoteApiProvider>) => void;
  setActiveRemoteApi: (providerId: string | null) => void;
  validateRemoteApi: (provider: RemoteApiProvider) => Promise<boolean>;

  // Active model selection
  setActiveModel: (modelId: string | null, providerType?: "local" | "remote") => void;
  getActiveModel: () => ModelSpec | null;

  // HF Token
  setHfToken: (token: string | null) => Promise<void>;

  // Per-model settings (display name, system prompt, stop words)
  getModelSettings: (modelId: string) => ModelSettings;
  updateModelSettings: (modelId: string, updates: Partial<ModelSettings>) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useModelStore = create<ModelState>()((set, get) => ({
  // Initial state
  models: [],
  presets: [],
  remoteApis: [],
  hfToken: null,
  modelSettings: {},
  activeModelId: null,
  activeProviderType: null,
  searchResults: [],
  searchLoading: false,
  searchError: null,
  activeDownloads: new Map(),

  // Persistence
  loadPersisted: async () => {
    try {
      const [modelsRaw, apisRaw, tokenRaw, activeRaw, settingsRaw] = await Promise.all([
        asyncStorage.getItem(STORAGE_KEY),
        asyncStorage.getItem(REMOTE_APIS_KEY),
        asyncStorage.getItem(HF_TOKEN_KEY),
        asyncStorage.getItem(ACTIVE_MODEL_KEY),
        asyncStorage.getItem(MODEL_SETTINGS_KEY),
      ]);

      if (modelsRaw) {
        const parsed = JSON.parse(modelsRaw);
        if (Array.isArray(parsed)) {
          set({ models: parsed });
        }
      }

      if (apisRaw) {
        const parsed = JSON.parse(apisRaw);
        if (Array.isArray(parsed)) {
          set({ remoteApis: parsed });
        }
      }

      if (tokenRaw) {
        set({ hfToken: tokenRaw });
      }

      if (activeRaw) {
        const parsed = JSON.parse(activeRaw);
        set({
          activeModelId: parsed.modelId,
          activeProviderType: parsed.providerType,
        });
      }

      set({ modelSettings: parseModelSettingsMap(settingsRaw) });

      // Load presets
      await get().loadPresets();
    } catch (e) {
      console.warn("Failed to load persisted model state:", e);
    }
  },

  saveModels: async () => {
    try {
      await asyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().models));
    } catch (e) {
      console.warn("Failed to save models:", e);
    }
  },

  saveRemoteApis: async () => {
    try {
      await asyncStorage.setItem(REMOTE_APIS_KEY, JSON.stringify(get().remoteApis));
    } catch (e) {
      console.warn("Failed to save remote APIs:", e);
    }
  },

  saveModelSettings: async () => {
    try {
      await asyncStorage.setItem(MODEL_SETTINGS_KEY, JSON.stringify(get().modelSettings));
    } catch (e) {
      console.warn("Failed to save model settings:", e);
    }
  },

  // Model management
  addModel: (model) => {
    set((state) => ({
      models: [...state.models.filter((m) => m.id !== model.id), model],
    }));
    get().saveModels();
  },

  removeModel: async (modelId) => {
    const model = get().getModel(modelId);
    if (model) {
      // Delete local file if exists (downloads in models/, imports in models/local/)
      if (model.origin !== "remote_api" && model.files[0]) {
        for (const dir of ["models/", "models/local/"]) {
          const filePath = `${LegacyFileSystem.documentDirectory}${dir}${model.files[0].name}`;
          try {
            await LegacyFileSystem.deleteAsync(filePath, { idempotent: true });
          } catch {
            // Ignore
          }
        }
      }
    }

    set((state) => ({
      models: state.models.filter((m) => m.id !== modelId),
      activeModelId:
        state.activeModelId === modelId ? null : state.activeModelId,
    }));
    get().saveModels();
  },

  updateModel: (modelId, updates) => {
    set((state) => ({
      models: state.models.map((m) =>
        m.id === modelId ? { ...m, ...updates } : m
      ),
    }));
    get().saveModels();
  },

  getModel: (modelId) => {
    return get().models.find((m) => m.id === modelId);
  },

  // Local file import
  addLocalModel: async (sourceUri, fileName, size) => {
    const base = LegacyFileSystem.documentDirectory ?? "";
    const dir = `${base}models/local/`;
    try {
      const info = await LegacyFileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await LegacyFileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      await LegacyFileSystem.copyAsync({ from: sourceUri, to: `${dir}${fileName}` });
    } catch (e) {
      console.warn("Failed to copy local model file:", e);
      throw e instanceof Error ? e : new Error("Copy failed");
    }

    // ponytail: replace reuses the file name — drop the stale row first.
    set((state) => ({
      models: state.models.filter(
        (m) => !(m.origin === "local" && m.files[0]?.name === fileName),
      ),
    }));
    get().addModel(
      buildLocalModelSpec({ id: `local-${generateId()}`, fileName, size }),
    );
  },

  // Presets
  loadPresets: async () => {
    const strategy = getStrategyById("huggingface");
    if (strategy) {
      const presets = await strategy.getPresets();
      set({ presets });
    }
  },

  // HF Search
  searchModels: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [], searchError: null });
      return;
    }

    set({ searchLoading: true, searchError: null });
    try {
      const strategy = getStrategyById("huggingface");
      if (strategy) {
        const results = await strategy.searchModels(query, get().hfToken ?? undefined);
        set({ searchResults: results, searchLoading: false });
      }
    } catch (error) {
      set({
        searchError: error instanceof Error ? error.message : "Search failed",
        searchLoading: false,
      });
    }
  },

  getModelFiles: async (modelId) => {
    const strategy = getStrategyById("huggingface");
    if (strategy) {
      return strategy.getModelFiles(modelId, get().hfToken ?? undefined);
    }
    return [];
  },

  // Downloads
  startDownload: async (modelId, file, token) => {
    const model = get().getModel(modelId);
    if (!model) {
      // Create new model spec from file
      let newModel: ModelSpec;
      const hfStrategy = getStrategyById("huggingface");

      if (hfStrategy && "path" in file) {
        // HF file
        const hfResult = get().searchResults.find((r) => r.modelId === modelId);
        if (hfResult) {
          newModel = hfStrategy.createModelSpecFromHF(hfResult, file, token);
        } else {
          throw new Error("HF model not found in search results");
        }
      } else {
        // Preset file
        const preset = get().presets.find((p) => p.id === modelId);
        if (preset) {
          newModel = hfStrategy!.createModelSpecFromPreset(preset, file);
        } else {
          throw new Error("Preset not found");
        }
      }

      get().addModel(newModel);
    }

    const targetModel = get().getModel(modelId)!;
    // Type guard for file type
    const isHFFile = "path" in file;
    const fileName = file.name;
    const downloadUrl = isHFFile ? file.downloadUrl : file.downloadUrl;
    const totalBytes = file.size;

    const jobId = `download-${generateId()}`;

    // Use legacy documentDirectory for string path
    const { documentDirectory } = await import("expo-file-system/legacy");
    const job = {
      id: jobId,
      modelId,
      fileName,
      downloadUrl,
      destinationPath: `${documentDirectory}models/${fileName}`,
      status: "downloading" as ModelDownloadStatus,
      progress: 0,
      downloadedBytes: 0,
      totalBytes,
      resumable: true,
    };

    // Update model status
    get().updateModel(modelId, {
      downloadStatus: "downloading",
      downloadProgress: 0,
      totalBytes,
      downloadedBytes: 0,
    });

    // Set up callbacks
    downloadService.setProgressCallback((downloadJob) => {
      get().updateModel(modelId, {
        downloadStatus: downloadJob.status,
        downloadProgress: downloadJob.progress,
        downloadedBytes: downloadJob.downloadedBytes,
        totalBytes: downloadJob.totalBytes,
        error: downloadJob.error,
      });
      get().syncDownloadStatus();
    });

    downloadService.setCompleteCallback((downloadJob, success) => {
      if (success) {
        get().updateModel(modelId, {
          downloadStatus: "completed",
          downloadProgress: 100,
          downloadedBytes: downloadJob.totalBytes,
          localPath: downloadJob.destinationPath,
        });
      } else {
        get().updateModel(modelId, {
          downloadStatus: "failed",
          error: downloadJob.error,
        });
      }
      get().syncDownloadStatus();
    });

    try {
      await downloadService.startDownload(job);
    } catch (error) {
      get().updateModel(modelId, {
        downloadStatus: "failed",
        error: error instanceof Error ? error.message : "Download failed",
      });
    }
  },

  pauseDownload: async (jobId) => {
    await downloadService.pauseDownload(jobId);
    get().syncDownloadStatus();
  },

  resumeDownload: async (jobId) => {
    await downloadService.resumeDownload(jobId);
    get().syncDownloadStatus();
  },

  cancelDownload: async (jobId) => {
    const job = downloadService.getJob(jobId);
    if (job) {
      get().updateModel(job.modelId, {
        downloadStatus: "idle",
        downloadProgress: 0,
        downloadedBytes: 0,
      });
    }
    await downloadService.cancelDownload(jobId);
    get().syncDownloadStatus();
  },

  syncDownloadStatus: () => {
    const jobs = downloadService.getAllJobs();
    const activeDownloads = new Map<string, ModelDownloadStatus>();
    jobs.forEach((job) => {
      activeDownloads.set(job.id, job.status);
    });
    set({ activeDownloads });
  },

  // Upload to backend
  uploadToBackend: async (modelId) => {
    const model = get().getModel(modelId);
    if (!model || model.origin === "remote_api") {
      return false;
    }

    const file = model.files[0];
    if (!file) {
      return false;
    }

    // ponytail: downloads live in models/, imports in models/local/.
    const base = LegacyFileSystem.documentDirectory ?? "";
    let filePath = `${base}models/${file.name}`;
    try {
      const info = await LegacyFileSystem.getInfoAsync(filePath);
      if (!info.exists) {
        filePath = `${base}models/local/${file.name}`;
      }
    } catch {
      // Fall through with default path
    }

    try {
      const result = await uploadService.uploadModel(filePath, file.name);
      return result.success;
    } catch {
      return false;
    }
  },

  // Remote API providers
  addRemoteApi: (provider) => {
    set((state) => ({
      remoteApis: [...state.remoteApis.filter((p) => p.id !== provider.id), provider],
    }));
    get().saveRemoteApis();
  },

  removeRemoteApi: (providerId) => {
    set((state) => ({
      remoteApis: state.remoteApis.filter((p) => p.id !== providerId),
      activeModelId:
        state.activeModelId === providerId ? null : state.activeModelId,
      activeProviderType:
        state.activeModelId === providerId ? null : state.activeProviderType,
    }));
    get().saveRemoteApis();
  },

  updateRemoteApi: (providerId, updates) => {
    set((state) => ({
      remoteApis: state.remoteApis.map((p) =>
        p.id === providerId ? { ...p, ...updates } : p
      ),
    }));
    get().saveRemoteApis();
  },

  setActiveRemoteApi: (providerId) => {
    const provider = providerId
      ? get().remoteApis.find((p) => p.id === providerId)
      : null;

    if (provider) {
      // Create a model spec for the remote API
      const remoteStrategy = getStrategyById("remote_api");
      const modelSpec = remoteStrategy!.createModelSpecFromRemoteApi(provider);

      get().addModel(modelSpec);
      get().setActiveModel(modelSpec.id, "remote");
    } else {
      set({ activeModelId: null, activeProviderType: null });
      asyncStorage.removeItem(ACTIVE_MODEL_KEY);
    }
  },

  validateRemoteApi: async (provider) => {
    const strategy = getStrategyById("remote_api");
    if (strategy) {
      return strategy.validateRemoteApi(provider);
    }
    return false;
  },

  // Active model selection
  setActiveModel: (modelId, providerType = "local") => {
    set({ activeModelId: modelId, activeProviderType: providerType });
    asyncStorage.setItem(
      ACTIVE_MODEL_KEY,
      JSON.stringify({ modelId, providerType }),
    );
  },

  getActiveModel: () => {
    const { activeModelId, models } = get();
    if (!activeModelId) return null;
    return models.find((m) => m.id === activeModelId) || null;
  },

  // HF Token
  setHfToken: async (token) => {
    set({ hfToken: token });
    if (token) {
      await asyncStorage.setItem(HF_TOKEN_KEY, token);
    } else {
      await asyncStorage.removeItem(HF_TOKEN_KEY);
    }
  },

  // Per-model settings
  getModelSettings: (modelId) => {
    return parseModelSettings(get().modelSettings[modelId]);
  },

  updateModelSettings: (modelId, updates) => {
    set((state) => ({
      modelSettings: {
        ...state.modelSettings,
        [modelId]: parseModelSettings({ ...state.modelSettings[modelId], ...updates }),
      },
    }));
    get().saveModelSettings();
  },
}));