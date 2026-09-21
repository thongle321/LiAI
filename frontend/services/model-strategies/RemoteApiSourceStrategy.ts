/** Remote API provider source strategy. */

import type {
  ModelSpec,
  PresetModel,
  PresetModelFile,
  HFModelSearchResult,
  HFModelFile,
  RemoteApiProvider,
} from "../../types/models";
import { ModelSourceStrategy } from "./ModelSourceStrategy";

export class RemoteApiSourceStrategy implements ModelSourceStrategy {
  readonly id = "remote_api";
  readonly name = "Remote API";

  async getPresets(): Promise<PresetModel[]> {
    return [];
  }

  async searchModels(query: string): Promise<HFModelSearchResult[]> {
    return [];
  }

  async getModelFiles(modelId: string): Promise<HFModelFile[]> {
    return [];
  }

  resolveDownloadUrl(modelId: string, fileName: string): string {
    return "";
  }

  async validateRemoteApi(provider: RemoteApiProvider): Promise<boolean> {
    try {
      const baseUrl = provider.baseUrl.replace(/\/$/, "");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (provider.apiKey && provider.apiKey !== "not-required") {
        headers.Authorization = `Bearer ${provider.apiKey}`;
      }

      // Try to list models or make a simple completion request
      const response = await fetch(`${baseUrl}/v1/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return true;
      }

      // Fallback: try a simple completion
      const testResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: provider.modelName,
          messages: [{ role: "user", content: "test" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      return testResponse.ok || testResponse.status === 400; // 400 means endpoint works but request was invalid
    } catch {
      return false;
    }
  }

  createModelSpecFromHF(
    hfResult: HFModelSearchResult,
    file: HFModelFile,
  ): ModelSpec {
    throw new Error("Remote API strategy cannot create model specs from HF");
  }

  createModelSpecFromPreset(preset: PresetModel, file: PresetModelFile): ModelSpec {
    throw new Error("Remote API strategy cannot create model specs from presets");
  }

  createModelSpecFromRemoteApi(provider: RemoteApiProvider): ModelSpec {
    return {
      id: `remote-${provider.id}`,
      name: provider.name,
      author: provider.providerType === "openrouter" ? "OpenRouter" : "Custom",
      description: `${provider.providerType} provider: ${provider.modelName}`,
      origin: "remote_api",
      type: "llm",
      files: [],
      providerType: provider.providerType,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelName: provider.modelName,
      downloadStatus: "completed", // Remote APIs don't download
      downloadProgress: 100,
      downloadedBytes: 0,
      totalBytes: 0,
    };
  }
}