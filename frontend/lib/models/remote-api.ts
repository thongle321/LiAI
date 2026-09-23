/** Remote (OpenAI-compatible) API source: validation + spec builder.
 *
 * Plain functions — no strategy interface. The store calls these directly.
 * Spec id stays stable for persisted-state upgrades: remote-<providerId>.
 */

import type { ModelSpec, RemoteApiProvider } from "../../types/models";

export async function validateRemoteApi(
  provider: RemoteApiProvider,
): Promise<boolean> {
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

export function buildRemoteModelSpec(provider: RemoteApiProvider): ModelSpec {
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
