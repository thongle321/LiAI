/** Chat API client: backend-owned sessions + XHR streaming.
 *
 * Plain fetch (lib/api.ts `request`) covers sessions/history; the streamed
 * turn needs XHR because React Native `fetch` cannot stream response bodies.
 * The XHR factory injects so node --test never touches the network stack:
 * the app uses the platform default, tests pass fakes.
 */

import { API_BASE_URL, isApiErrorResponse, request } from "../api.ts";
import type { ApiError, ByokAuth, SearchAuth } from "../../types/api.ts";
import type { SessionInfo } from "../../types/chat.ts";
import { createSseAccumulator, type ChatStreamEvent } from "./sse.ts";

/** Wall-clock ceiling for one streamed turn (ms). Streams end via
 * completion, error events, or user cancel; this only catches a hung
 * socket that would otherwise pin `sending` forever. */
export const STREAM_TIMEOUT_MS = 300_000;

export interface SessionPatch {
  title?: string;
  pinned?: boolean;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await request<{ sessions: SessionInfo[] }>("/api/sessions", {
    method: "GET",
  });
  return res.sessions;
}

export function updateSession(id: string, patch: SessionPatch): Promise<SessionInfo> {
  return request<SessionInfo>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await request<{ message: string }>(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Structural XHR surface the streamer uses — real and fake both fit. */
export interface MinimalXhr {
  readonly responseText: string;
  readonly status: number;
  timeout: number;
  onprogress: ((ev: unknown) => void) | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
  open(method: string, url: string, async: boolean): void;
  setRequestHeader(name: string, value: string): void;
  send(body?: string): void;
  abort(): void;
}

function defaultXhr(): MinimalXhr {
  const Xhr = (globalThis as Record<string, unknown>)["XMLHttpRequest"];
  if (typeof Xhr !== "function") {
    throw new Error("XMLHttpRequest is unavailable on this platform");
  }
  // SAFETY: constructed only where the platform provides XHR (the app
  // runtime); tests always inject a fake factory, so this cast never runs
  // under node --test. Structural use is confined to MinimalXhr above.
  return new (Xhr as unknown as new () => MinimalXhr)();
}

export interface StreamBody {
  message?: string;
  session_id?: string;
  image?: string;
  stream: true;
  retry?: boolean;
  search?: SearchAuth;
  model_id?: string;
  byok?: ByokAuth;
}

export interface StreamHandle {
  cancel: () => void;
  done: Promise<void>;
}

function envelopeError(status: number, text: string): ApiError {
  try {
    const body: unknown = JSON.parse(text);
    if (isApiErrorResponse(body)) return body.error;
  } catch {
    // fall through to the generic mapping below
  }
  return { code: "http_error", message: `Request failed with status ${status}` };
}

/** Open a streamed turn. Events arrive via onEvent; done resolves on HTTP
 * 200 completion and rejects with an ApiError otherwise (envelope, network,
 * timeout, or cancelled). */
export function postChatStream(
  body: StreamBody,
  onEvent: (event: ChatStreamEvent) => void,
  openXhr: () => MinimalXhr = defaultXhr,
): StreamHandle {
  const xhr = openXhr();
  const acc = createSseAccumulator();
  let consumed = 0;
  let settled = false;
  let resolveDone!: () => void;
  let rejectDone!: (err: ApiError) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  // The store observes outcomes through onEvent + done; callers that only
  // watch events must not trip unhandled rejections.
  done.catch(() => {});

  function settleOk(): void {
    if (!settled) {
      settled = true;
      resolveDone();
    }
  }

  function settleErr(err: ApiError): void {
    if (!settled) {
      settled = true;
      rejectDone(err);
    }
  }

  function drain(): void {
    const fresh = xhr.responseText.slice(consumed);
    consumed += fresh.length;
    for (const event of acc.push(fresh)) onEvent(event);
  }

  xhr.onprogress = () => drain();
  xhr.onload = () => {
    drain();
    if (xhr.status === 200) {
      settleOk();
    } else {
      settleErr(envelopeError(xhr.status, xhr.responseText));
    }
  };
  xhr.onerror = () =>
    settleErr({ code: "network", message: "Network request failed" });
  xhr.ontimeout = () => settleErr({ code: "timeout", message: "Stream timed out" });
  xhr.onabort = () => settleErr({ code: "cancelled", message: "Stream cancelled" });

  xhr.timeout = STREAM_TIMEOUT_MS;
  xhr.open("POST", `${API_BASE_URL}/api/chat`, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(JSON.stringify(body));

  return {
    cancel: () => xhr.abort(),
    done,
  };
}
