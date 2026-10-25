/** Shared transport fakes for the agent search suites.
 *
 *  `hangingFetch` is the cancellation seam: only an abort settles the
 *  request, so a test can prove a stopped turn really cancels its network
 *  work instead of merely ignoring the answer.
 */

import type { HttpFetch } from "@/services/agent/search.ts";

/** A transport that never answers; `calls` records the URLs it was given. */
export function hangingFetch(): { fetchImpl: HttpFetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: HttpFetch = (url, init) => {
    calls.push(url);
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  };
  return { fetchImpl, calls };
}

/** One macrotask beat: lets a started run reach its first await. */
export const flushTick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
