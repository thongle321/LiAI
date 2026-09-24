/** QVAC inference adapter behind the CompletionEngine seam (spike).
 *
 * Structural QvacClientLike keeps this file native-free so node tests
 * inject scripted fakes; the app passes the real `@qvac/sdk` functions
 * (completion/cancel) bound the same way. Model load/unload stays with
 * the caller (EngineManager slot later); this file only runs turns.
 *
 * Simplifications for the spike (Q6/Q8): thinking deltas are dropped,
 * tool-role history folds back to user content (QVAC history is
 * user/assistant only), image paths attach to the last user message.
 */

import type {
  CompletionCallbacks,
  CompletionEngine,
  CompletionOutcome,
  CompletionRequest,
  EngineToolCall,
} from "./engine.ts";

export interface QvacAttachment {
  path: string;
}

export interface QvacHistoryMessage {
  role: string;
  content: string;
  attachments?: QvacAttachment[];
}

export interface QvacTool {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
}

export type QvacEvent =
  | { type: "contentDelta"; text: string }
  | { type: "thinkingDelta"; text: string }
  | { type: "rawDelta"; text: string }
  | {
      type: "toolCall";
      call: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | { type: "toolError"; error: { message: string } }
  | { type: "completionStats"; stats: { promptTokens?: number; generatedTokens?: number } }
  | { type: "completionDone"; stopReason?: string };

export interface QvacRun {
  requestId: string;
  events: AsyncIterable<QvacEvent>;
  final: Promise<{
    contentText: string;
    toolCalls: Array<{ id: string; name: string; arguments: unknown }>;
    stats?: { promptTokens?: number; generatedTokens?: number };
  }>;
}

/** Model type for chat/vision turns (QVAC llamacpp-completion plugin). */
export const QVAC_COMPLETION_MODEL = "llamacpp-completion";

/** Load a GGUF by absolute path with CPU defaults (Q3/Q6). */
export async function loadQvacModel(
  client: QvacModelClient,
  opts: { filePath: string; mmprojPath?: string; ctxSize?: number; device?: string },
): Promise<string> {
  const { filePath, mmprojPath, ctxSize = 2048, device = "cpu" } = opts;
  return client.loadModel({
    modelSrc: filePath,
    modelType: QVAC_COMPLETION_MODEL,
    modelConfig: {
      ctx_size: ctxSize,
      device,
      ...(mmprojPath ? { projectionModelSrc: mmprojPath } : {}),
    },
  });
}

/** Unload a model, always keeping its downloaded files. */
export async function unloadQvacModel(
  client: QvacModelClient,
  modelId: string,
): Promise<void> {
  await client.unloadModel({ modelId, clearStorage: false });
}

/** Structural slice of `@qvac/sdk` model loading (fakes satisfy it). */
export interface QvacModelClient {
  loadModel(opts: {
    modelSrc: string;
    modelType: string;
    modelConfig: Record<string, unknown>;
  }): Promise<string>;
  unloadModel(opts: { modelId: string; clearStorage: boolean }): Promise<void> | void;
}

/** Structural slice of `@qvac/sdk` a turn touches (fakes satisfy it). */
export interface QvacClientLike extends QvacModelClient {
  completion(params: {
    modelId: string;
    history: QvacHistoryMessage[];
    stream: boolean;
    tools?: QvacTool[];
  }): QvacRun;
  cancel(params: { requestId: string }): Promise<void> | void;
}

/** Expo file URIs are `file://…`; QVAC wants a plain fs path. */
export function stripFileScheme(uri: string): string {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

function toHistory(req: CompletionRequest): QvacHistoryMessage[] {
  const history: QvacHistoryMessage[] = req.messages.map((m) => ({
    role: m.role === "tool" ? "user" : m.role,
    content: m.content,
  }));
  const paths = req.imagePaths ?? [];
  if (paths.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]?.role === "user") {
        history[i] = {
          ...(history[i] as QvacHistoryMessage),
          attachments: paths.map((p) => ({ path: stripFileScheme(p) })),
        };
        break;
      }
    }
  }
  return history;
}

function toTools(req: CompletionRequest): QvacTool[] | undefined {
  if (!req.tools || req.tools.length === 0) return undefined;
  return req.tools.map((t) => ({
    type: "function" as const,
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}

function projectCall(call: { id: string; name: string; arguments: unknown }): EngineToolCall {
  return { id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) };
}

/** Run turns against an already-loaded QVAC model id. */
export function createQvacEngine(client: QvacClientLike, modelId: string): CompletionEngine {
  let inflight: string | null = null;
  return {
    async completion(
      request: CompletionRequest,
      callbacks: CompletionCallbacks,
    ): Promise<CompletionOutcome> {
      const tools = toTools(request);
      const run = client.completion({
        modelId,
        history: toHistory(request),
        stream: true,
        ...(tools ? { tools } : {}),
      });
      inflight = run.requestId;
      const seen: EngineToolCall[] = [];
      let stoppedEarly = false;
      try {
        for await (const event of run.events) {
          if (event.type === "contentDelta") callbacks.onToken(event.text);
          else if (event.type === "toolCall") {
            const call = projectCall(event.call);
            seen.push(call);
            callbacks.onToolCalls?.([call]);
          } else if (event.type === "completionDone") {
            stoppedEarly = event.stopReason === "cancelled";
          }
          // thinkingDelta dropped (Q8); toolError/stats ride the final.
        }
        const final = await run.final;
        const toolCalls = final.toolCalls.map(projectCall);
        if (toolCalls.length > 0 && seen.length === 0) {
          callbacks.onToolCalls?.(toolCalls);
        }
        return {
          text: final.contentText,
          toolCalls: toolCalls.length > 0 ? toolCalls : seen,
          promptTokens: final.stats?.promptTokens ?? 0,
          completionTokens: final.stats?.generatedTokens ?? 0,
          stoppedEarly,
        };
      } finally {
        inflight = null;
      }
    },

    async stopCompletion(): Promise<void> {
      if (inflight === null) return;
      await client.cancel({ requestId: inflight });
    },
  };
}
