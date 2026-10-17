/** Retry + failure-copy policy for Hub file downloads.
 *
 * Pure, so the policy is testable without a native seam (same reason
 * `resume-state.ts` exists). The service does the sleeping; this decides
 * what is worth sleeping for and what the user is told.
 *
 * PocketPal parity: 5xx retries with exponential backoff
 * (`DownloadWorker.kt:285`); 429 is a throttle the server dictates the
 * length of, so `Retry-After` wins over our own curve; 4xx never retries
 * (`DownloadWorker.kt:145`). 401 and 403 stay distinct the way
 * `errors.ts:88-100` keeps them — one is a bad token, the other is a repo
 * this account cannot read, and they need different words.
 */

import type { DownloadErrorCode } from "../../types/models.ts";

/** Which failures the UI can offer a real fix for.
 *
 * Only 401 qualifies. 403 deliberately does not: it means the account
 * cannot read the repo, and retrying without the token cannot grant that,
 * so a "disable token and retry" button would be a dead end dressed up as
 * help. Everything else needs the user to do something outside the app
 * (accept a licence, free disk, wait out a throttle). */
export function errorCodeForStatus(status: number): DownloadErrorCode | undefined {
  return status === 401 ? "authentication" : undefined;
}

/** Total attempts, including the first. Three is enough to ride out a CDN
 *  blip without turning a dead link into a two-minute spinner. */
export const MAX_ATTEMPTS = 3;

const MAX_BACKOFF_MS = 30_000;

/** Server says "come back later": 429 and 5xx. Everything else — 401, 403,
 *  404, 416 — is a fact about the request that a retry cannot change. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Case-insensitive header read: expo hands back whatever the platform
 *  lowercased (OkHttp) or preserved (NSURLSession), and `Retry-After` is
 *  spelled both ways in the wild. Accepts a plain record or a fetch
 *  `Headers`, because the two read paths each get one from expo-fetch. */
function header(
  headers: Record<string, string> | Headers | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

/** How long to wait before attempt `attempt + 1`.
 *
 * `Retry-After` is either delta-seconds or an HTTP-date; both appear, so
 * both are parsed. A past date means "now", not "never". Falls back to
 * exponential backoff, which is what PocketPal uses when the server has
 * no opinion. */
export function retryAfterMs(
  headers: Record<string, string> | Headers | undefined,
  attempt: number,
): number {
  const raw = header(headers, "Retry-After")?.trim();
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(MAX_BACKOFF_MS, seconds * 1000);
    }
    const at = Date.parse(raw);
    if (!Number.isNaN(at)) {
      return Math.min(MAX_BACKOFF_MS, Math.max(0, at - Date.now()));
    }
  }
  return Math.min(MAX_BACKOFF_MS, 2 ** attempt * 1000);
}

/** The message the card shows. Names the fix, because every status here is
 *  something the user can act on and a bare "HTTP 403" is not. The code
 *  stays in the string too: it costs nothing and it is what a user reads
 *  back to us from a screenshot when a retry didn't help. */
export function describeHttpFailure(status: number): string {
  const reason = failureReason(status);
  return `${reason} (HTTP ${status})`;
}

function failureReason(status: number): string {
  if (status === 401) {
    return "Hugging Face rejected your token — check it in Settings, then Retry";
  }
  if (status === 403) {
    return "Your Hugging Face account can't read this repo — accept its terms on huggingface.co, then Retry";
  }
  if (status === 404) {
    return "This file is no longer on Hugging Face — the repo may have renamed or removed it";
  }
  if (status === 416) {
    return "The file changed on Hugging Face — Retry to start it again";
  }
  if (status === 429) {
    return "Hugging Face is rate-limiting this download — wait a moment, then Retry";
  }
  return "Download failed";
}