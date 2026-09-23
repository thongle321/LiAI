/** Chat model routing: active model -> model_id/byok (pure).
 *
 * No store imports — the caller supplies state snapshots and a key reader,
 * so node --test drives this directly and the app wires live stores.
 */

import { buildRemoteModelSpec } from "../models/remote-api.ts";
import type { ByokAuth } from "../../types/api.ts";
import type { ModelSpec, RemoteApiProvider } from "../../types/models.ts";

export interface ChatModelRef {
  model_id?: string;
  byok?: ByokAuth;
}

export async function resolveChatModel(input: {
  activeModelId: string | null;
  activeProviderType: "local" | "remote" | null;
  models: ModelSpec[];
  remoteApis: RemoteApiProvider[];
  readKey: (providerId: string) => Promise<string | null>;
}): Promise<ChatModelRef | null> {
  const { activeModelId, activeProviderType } = input;
  if (!activeModelId) return null;
  if (activeProviderType === "remote") {
    const provider = input.remoteApis.find(
      (p) => buildRemoteModelSpec(p).id === activeModelId,
    );
    if (!provider) return null;
    const key = await input.readKey(provider.id).catch(() => null);
    if (!key) return null;
    return {
      model_id: activeModelId,
      byok: {
        provider: provider.providerType,
        base_url: provider.baseUrl,
        api_key: key,
        model: provider.modelName,
      },
    };
  }
  const spec = input.models.find((m) => m.id === activeModelId);
  const file = spec?.files[0];
  if (!spec || !file || spec.downloadStatus !== "completed") return null;
  return { model_id: file.name };
}
