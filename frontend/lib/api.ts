/** Typed fetch wrapper for the LiAI backend (Expo ↔ FastAPI contract).
 *
 * - Base URL resolves itself: EXPO_PUBLIC_API_URL when set (manual
 *   override, e.g. tunnel or emulator), else the Metro host's LAN IP
 *   read at runtime (your phone already reaches the dev machine there,
 *   so a changing IPv4 needs no .env.local edit), else localhost:8000.
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
  HistoryResponse,
} from "../types/api.ts";

export const API_BASE_URL = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  metroHostUri(),
);

/** Pure seam: explicit override wins, else the Metro host's LAN IP. */
export function resolveApiBaseUrl(
  envUrl: string | undefined,
  hostUri: string | null,
): string {
  if (envUrl !== undefined && envUrl !== "") return envUrl;
  const ip = hostUri?.match(/^(\d{1,3}(?:\.\d{1,3}){3})/)?.[1];
  if (ip !== undefined) return `http://${ip}:8000`;
  return "http://localhost:8000";
}

/** The phone already reaches Metro on this machine's LAN IP — reuse it.
 * expo-constants is Metro-runtime only; node tests fall through to null. */
function metroHostUri(): string | null {
  try {
    const req = (
      globalThis as {
        require?: (m: string) => {
          default?: { expoConfig?: { hostUri?: unknown } };
        };
      }
    ).require;
    const hostUri = req?.("expo-constants")?.default?.expoConfig?.hostUri;
    return typeof hostUri === "string" ? hostUri : null;
  } catch {
    return null;
  }
}

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
  image?: string,
): Promise<ChatResponse> {
  const body: ChatRequest = { message };
  if (sessionId !== undefined) body.session_id = sessionId;
  if (image !== undefined) body.image = image;
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Fetch stored turns. Pass the stored session_id to resume, omit for fresh. */
export function getHistory(sessionId?: string): Promise<HistoryResponse> {
  const path = sessionId
    ? `/api/history?session_id=${encodeURIComponent(sessionId)}`
    : "/api/history";
  return request<HistoryResponse>(path, { method: "GET" });
}

/** Cheap reachability probe for app start. Does not create a chat turn. */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { method: "GET" });
}
