/** On-device inference engine seam (ADR-0008).
 *
 * Pure parts (file resolution, source selection) live here and are
 * node-tested. The native runner (llama.rn context lifecycle) hangs off
 * the CompletionEngine interface below once the dep lands — this file
 * must not import it until then, so tests stay native-free.
 */

import { buildRemoteModelSpec } from "../models/remote-api.ts";
import type { ModelSpec, RemoteApiProvider } from "../../types/models.ts";

/** Token deltas stream here; the runner feeds bubbles directly. */
export interface CompletionCallbacks {
  onToken: (text: string) => void;
  /** Tool calls the model emitted alongside (or instead of) text. */
  onToolCalls?: (calls: EngineToolCall[]) => void;
}

/** Minimal tool-call shape both engines project to (llama + OpenAI). */
export interface EngineToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Result of one finished completion (plain text + tool calls + usage). */
export interface CompletionOutcome {
  text: string;
  toolCalls: EngineToolCall[];
  promptTokens: number;
  completionTokens: number;
  stoppedEarly: boolean;
}

/** One chat turn in the engine's wire shape (llama + OpenAI compatible). */
export interface CompletionMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: EngineToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** OpenAI function-calling tool schema shape. */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** What the runner sends per turn: history + (unless forced-final) tools. */
export interface CompletionRequest {
  messages: CompletionMessage[];
  tools?: ToolDefinition[];
  /** Local file paths for multimodal turns (llama media_paths). */
  imagePaths?: string[];
}

/** PocketPal's CompletionEngine shape: stream + stop. */
export interface CompletionEngine {
  completion(
    request: CompletionRequest,
    callbacks: CompletionCallbacks,
  ): Promise<CompletionOutcome>;
  stopCompletion(): Promise<void>;
}

export type EngineSource =
  | { kind: "local"; fileName: string }
  | { kind: "remote"; provider: RemoteApiProvider };

/** Local-first pick from the same active-model state the chat uses. */
export function selectEngineSource(input: {
  activeModelId: string | null;
  activeProviderType: "local" | "remote" | null;
  models: ModelSpec[];
  remoteApis: RemoteApiProvider[];
}): EngineSource | null {
  const { activeModelId, activeProviderType } = input;
  if (!activeModelId) return null;
  if (activeProviderType === "remote") {
    const provider = input.remoteApis.find(
      (p) => buildRemoteModelSpec(p).id === activeModelId,
    );
    return provider ? { kind: "remote", provider } : null;
  }
  const spec = input.models.find((m) => m.id === activeModelId);
  const file = spec?.files[0];
  if (!spec || !file || spec.downloadStatus !== "completed") return null;
  return { kind: "local", fileName: file.name };
}

/** Absolute path of a downloaded GGUF inside the app documents dir. */
export function resolveLocalFile(
  documentDir: string,
  fileName: string,
): string {
  const base = documentDir.endsWith("/") ? documentDir : `${documentDir}/`;
  const safe = fileName.split("/").pop() ?? fileName;
  return `${base}models/${safe}`;
}
