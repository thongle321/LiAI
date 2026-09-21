/** Direct URL model source strategy. */

import type {
  ModelSpec,
  PresetModel,
  PresetModelFile,
  HFModelSearchResult,
  HFModelFile,
  RemoteApiProvider,
} from "../../types/models";
import { ModelSourceStrategy } from "./ModelSourceStrategy";

export class DirectUrlSourceStrategy implements ModelSourceStrategy {
  readonly id = "direct_url";
  readonly name = "Direct URL";

  async getPresets(): Promise<PresetModel[]> {
    return [];
  }

  async searchModels(query: string): Promise<HFModelSearchResult[]> {
    // Direct URL strategy doesn't search
    return [];
  }

  async getModelFiles(modelId: string): Promise<HFModelFile[]> {
    // Not applicable for direct URLs
    return [];
  }

  resolveDownloadUrl(modelId: string, fileName: string): string {
    // modelId is the direct URL
    return modelId;
  }

  async validateRemoteApi(provider: RemoteApiProvider): Promise<boolean> {
    // Direct URL strategy doesn't validate remote APIs
    return false;
  }

  createModelSpecFromHF(
    hfResult: HFModelSearchResult,
    file: HFModelFile,
  ): ModelSpec {
    throw new Error("Direct URL strategy cannot create model specs from HF");
  }

  createModelSpecFromPreset(preset: PresetModel, file: PresetModelFile): ModelSpec {
    throw new Error("Direct URL strategy cannot create model specs from presets");
  }

  createModelSpecFromRemoteApi(provider: RemoteApiProvider): ModelSpec {
    throw new Error("Direct URL strategy cannot create remote API model specs");
  }

  /** Create a model spec from a direct GGUF URL */
  createModelSpecFromUrl(url: string, name?: string): ModelSpec {
    const fileName = url.split("/").pop() || "model.gguf";
    return {
      id: `direct-${Date.now()}`,
      name: name || fileName,
      author: "Custom",
      description: `Downloaded from ${url}`,
      origin: "local",
      type: "llm",
      files: [
        {
          name: fileName,
          size: 0, // Unknown until download
          downloadUrl: url,
        },
      ],
      downloadStatus: "idle",
      downloadProgress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
    };
  }
}