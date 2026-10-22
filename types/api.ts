/** Shared chat-domain types (on-device).
 *
 * SearchAuth rides each turn into the local talent (consent-gated BYOK
 * key, never persisted); ApiError is the bubble error shape. The old
 * backend contract (ChatRequest/Response, history, health, model list,
 * BYOK envelope) retired with the FastAPI backend (ADR-0008).
 * Erasable TypeScript only (no enums) so the files stay strippable.
 */

export type SearchProviderId = "tavily" | "brave";

export interface SearchAuth {
  provider: SearchProviderId;
  key: string;
  count: number;
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

/** Stable error shape for bubbles: { code, message }. */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
}
