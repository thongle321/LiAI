/** Base interface for model source strategies. */

import type {
  ModelSpec,
  PresetModel,
  PresetModelFile,
  HFModelSearchResult,
  HFModelFile,
  RemoteApiProvider,
} from "../../types/models";

export interface ModelSourceStrategy {
  /** Unique identifier for this strategy */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Get preset models available for download */
  getPresets(): Promise<PresetModel[]>;

  /** Search Hugging Face for models */
  searchModels(query: string, token?: string): Promise<HFModelSearchResult[]>;

  /** Get GGUF files for a specific Hugging Face model */
  getModelFiles(modelId: string, token?: string): Promise<HFModelFile[]>;

  /** Resolve download URL for a specific file */
  resolveDownloadUrl(modelId: string, fileName: string, token?: string): string;

  /** Validate remote API provider configuration */
  validateRemoteApi(provider: RemoteApiProvider): Promise<boolean>;

  /** Create model spec from HF model and selected file */
  createModelSpecFromHF(
    hfResult: HFModelSearchResult,
    file: HFModelFile,
    token?: string,
  ): ModelSpec;

  /** Create model spec from preset model and selected file */
  createModelSpecFromPreset(preset: PresetModel, file: PresetModelFile): ModelSpec;

  /** Create model spec from remote API provider */
  createModelSpecFromRemoteApi(provider: RemoteApiProvider): ModelSpec;
}

export abstract class BaseModelSourceStrategy implements ModelSourceStrategy {
  abstract readonly id: string;
  abstract readonly name: string;

  abstract getPresets(): Promise<PresetModel[]>;
  abstract searchModels(query: string, token?: string): Promise<HFModelSearchResult[]>;
  abstract getModelFiles(modelId: string, token?: string): Promise<HFModelFile[]>;
  abstract resolveDownloadUrl(modelId: string, fileName: string, token?: string): string;
  abstract validateRemoteApi(provider: RemoteApiProvider): Promise<boolean>;
  abstract createModelSpecFromHF(
    hfResult: HFModelSearchResult,
    file: HFModelFile,
    token?: string,
  ): ModelSpec;
  abstract createModelSpecFromPreset(preset: PresetModel, file: PresetModelFile): ModelSpec;
  abstract createModelSpecFromRemoteApi(provider: RemoteApiProvider): ModelSpec;
}