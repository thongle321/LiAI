/** Typed fetch wrapper for the LiAI backend (Expo ↔ FastAPI contract).
 *
 * - Base URL from EXPO_PUBLIC_API_URL, default http://localhost:8000.
 *   Physical devices cannot reach localhost: set
 *   EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000 in .env.
 * - 30s timeout per request, no automatic retries: chat POSTs are not
 *   safely retryable yet, so timeout/network failures surface as ApiError
 *   codes and the user retries manually.
 * - All failures surface as ApiError { code, message } — the same envelope
 *   the backend returns. Thrown values are plain ApiError objects.
 */

import type {
  ApiError,
  ApiErrorCode,
  ApiErrorResponse,
  ChatRequest,
  ChatResponse,
  HealthResponse,
} from "../types/api.js";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const REQUEST_TIMEOUT_MS = 30_000;

function apiError(code: ApiErrorCode, message: string): ApiError {
  return { code, message };
}

function isApiErrorResponse(body: unknown): body is ApiErrorResponse {
  if (typeof body !== "object" || body === null) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!resp.ok) {
      let body: unknown = null;
      try {
        body = await resp.json();
      } catch {
        body = null;
      }
      if (isApiErrorResponse(body)) throw body.error;
      throw apiError("http_error", `Request failed with status ${resp.status}`);
    }
    return (await resp.json()) as T;
  } catch (err) {
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      typeof (err as { code?: unknown }).code === "string"
    )
      throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw apiError("timeout", "Request timed out after 30s");
    }
    throw apiError(
      "network",
      err instanceof Error ? err.message : "Network request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Send one chat turn. Pass the stored session_id to continue, omit to start. */
export function postChat(
  message: string,
  sessionId?: string,
): Promise<ChatResponse> {
  const body: ChatRequest = sessionId
    ? { message, session_id: sessionId }
    : { message };
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Cheap reachability probe for app start. Does not create a chat turn. */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { method: "GET" });
}
