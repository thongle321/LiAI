/** Backend contract types for POST /api/chat and GET /health.
 *
 * Mirrors the FastAPI schemas in backend/app/schemas/chat.py.
 * Erasable TypeScript only (no enums) so the files stay strippable.
 */

export interface ChatRequest {
  message: string;
  session_id?: string;
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
  | "timeout";

/** Stable error envelope: { error: { code, message } }. */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}
