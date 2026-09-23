/** Backend contract types for POST /api/chat and GET /health.
 *
 * Mirrors the FastAPI schemas in backend/app/modules/chat/schemas.py.
 * Erasable TypeScript only (no enums) so the files stay strippable.
 */

import type { SearchProviderId } from "../lib/search-providers.ts";
import type { RemoteApiProvider } from "./models.ts";

export interface SearchAuth {
  provider: SearchProviderId;
  key: string;
  count: number;
}

/** Per-request provider credentials (BYOK): transient, never persisted. */
export interface ByokAuth {
  provider: RemoteApiProvider["providerType"];
  base_url: string;
  api_key: string;
  model: string;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  /** Optional JPEG data-uri; backend routes it to the VLM when present. */
  image?: string;
  /** Per-request web-search credentials (BYOK); sent only with consent. */
  search?: SearchAuth;
  /** Backend GGUF filename serves locally; provider-backed id routes by byok. */
  model_id?: string;
  /** Per-request BYOK creds for provider-backed ids; needs model_id. */
  byok?: ByokAuth;
}

export interface ChatResponse {
  reply: string;
  session_id: string;
}

export interface HealthResponse {
  status: string;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  /** Structural turn metadata (tool names/runs, token usage); absent stays absent. */
  metadata?: {
    tool_calls?: string[];
    tool_runs?: { name: string; input?: unknown; result?: unknown }[];
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  } | null;
}

export interface HistoryResponse {
  session_id: string;
  messages: HistoryMessage[];
}

export type ApiErrorCode =
  | "invalid_request"
  | "llm_error"
  | "store_error"
  | "not_found"
  | "http_error"
  | "internal_error"
  | "network"
  | "timeout"
  | "conflict"
  | "cancelled"
  | "upload_failed"
  | "list_failed"
  | "delete_failed";

/** Stable error envelope: { error: { code, message } }. */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface ModelListResponse {
  models: string[];
}