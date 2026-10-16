/** On-device inference engine seam (ADR-0008).
 *
 * Pure parts (file resolution, source selection) live here and are
 * node-tested. The native runner (llama.rn context lifecycle) hangs off
 * the CompletionEngine interface below once the dep lands — this file
 * must not import it until then, so tests stay native-free.
 */

import { buildRemoteModelSpec } from "../models/remote-api.ts";
import type { EffortLevel } from "../../utils/reasoning-capability.ts";
import type { ModelOrigin, ModelSpec, RemoteApiProvider } from "../../types/models.ts";
// The timings shape is a DOMAIN type, defined once in types/chat.ts and
// shared: the engine projects it, the store persists it, the footer reads
// it. Restating it here would be a second definition waiting to drift.
import type { TurnTimings } from "../../types/chat.ts";
import type { SamplerParams } from "./sampler.ts";

/** Token deltas stream here; the runner feeds bubbles directly. */
export interface CompletionCallbacks {
  onToken: (text: string) => void;
  /** Cumulative reasoning so far (mirrors llama.rn's reasoning_content,
   *  which arrives accumulated, not as a delta). */
  onReasoning?: (cumulative: string) => void;
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
  /** Final parsed reasoning; "" when the model emitted none. */
  reasoning?: string;
  toolCalls: EngineToolCall[];
  /** Tokens held against the window, for the fill meter: local = KV
   *  residency (`tokens_cached`), remote = `prompt_tokens` (which
   *  includes the cached subset). C3. */
  promptTokens: number;
  completionTokens: number;
  /** The sampler stopped the turn early — n_predict hit. Distinct from
   *  `interrupted`, which is the USER stopping it. */
  stoppedEarly: boolean;
  /** The turn could not fit in the context window: `context_full` or
   *  `truncated` from the engine. Drives the chat screen's context-full
   *  banner and its "More room" recovery. */
  contextFull?: boolean;
  /** The user pressed Stop mid-turn, so the partial reply is a deliberate
   *  stopping point rather than a finished answer. */
  interrupted?: boolean;
  /** Wall-clock figures for the turn footer. Absent when the engine does
   *  not report them (most remote endpoints do not). */
  timings?: TurnTimings;
}

/** One chat turn in the engine's wire shape (llama + OpenAI compatible). */
export interface CompletionMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  /** Assistant reasoning, read back by llama.cpp's chat parser and
   *  re-serialized into the template JSON (chat.cpp:464). Sent only when
   *  include_thinking_in_context says so. */
  reasoning_content?: string;
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
    /** This talent's RECOMMENDED context cost, in tokens. OPTIONAL and
     *  absent by default: a definition that does not declare one is not
     *  heavy, so no existing tool changes behaviour. When present it is
     *  what lets the context-full banner name the tool that needs the
     *  most room. Not sent on the wire — the shape above is what the
     *  provider sees. */
    recommendedContextTokens?: number;
  };
}

/** What the runner sends per turn: history + (unless forced-final) tools. */
export interface CompletionRequest {
  messages: CompletionMessage[];
  tools?: ToolDefinition[];
  /** Local file paths for multimodal turns (llama media_paths). */
  imagePaths?: string[];
  /** Remote vision (04): the turn's images as data URIs — an HTTP server
   *  cannot read app-local files, so OpenAI content arrays carry these.
   *  Local engines ignore them (they read imagePaths). */
  imageDataUris?: string[];
  /** Local-only: jinja thinking blocks on/off (native default true). */
  enableThinking?: boolean;
  /** Local-only: jinja chat template on/off (native default true). */
  jinja?: boolean;
  /** Local-only: sampling params. Remote engines ignore them — an OpenAI-
   *  compatible endpoint has its own defaults and no equivalent for the
   *  llama-only knobs (typical-p, XTC, mirostat). */
  sampler?: SamplerParams;
  /** Per-model stop words from ModelSettings (PocketPal `stop`). Both
   *  engines honor it: llama.rn's `stop` strings and OpenAI's `stop`. */
  stop?: string[];
  /** Per-model chat-template override (PocketPal chatTemplate). llama.rn
   *  only; remote engines use the provider's own template. "" = default. */
  chatTemplate?: string;
  /** Graded reasoning effort. Undefined sends nothing — the model's own
   *  default depth stands. Reaches llama.rn as
   *  `chat_template_kwargs.reasoning_effort`, the supported equivalent of
   *  llama.cpp's --reasoning-effort; only templates that read the kwarg act
   *  on it (utils/reasoning-capability.ts). */
  reasoningEffort?: EffortLevel;
  /** Per-model add-generation-prompt override (PocketPal parity).
   *  llama.rn only. */
  addGenerationPrompt?: boolean;
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

/** Can this spec be loaded as a LOCAL model right now?
 *
 * ONE predicate, because two readers used to answer this differently and
 * the composer lost. `selectEngineSource` needed a file; the header's
 * pickableModels only checked `downloadStatus`. A remote provider is
 * written into `models` as a spec — `origin: "remote_api"`, `files: []`,
 * `downloadStatus: "completed"` (services/models//remote-api.ts) — because that
 * spec is the only thing that can mark a remote model active in the header.
 * So the header offered it as a local model, chat.tsx's
 * `target.host === undefined` handed its `remote-…` id to
 * `setActiveModel(id, "local")`, and from then on the composer read
 * "Model not loaded." beneath a header still naming the model.
 *
 * `origin` is tested alongside the file so the rule reads the same at both
 * call sites and survives a spec that carries a placeholder file.
 */
export function isLocalModelReady(spec: {
  origin?: ModelOrigin;
  downloadStatus: string;
  files?: ReadonlyArray<unknown>;
}): boolean {
  return (
    spec.origin !== "remote_api" &&
    spec.downloadStatus === "completed" &&
    (spec.files?.length ?? 0) > 0
  );
}

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
  if (!spec || !file || !isLocalModelReady(spec)) return null;
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
