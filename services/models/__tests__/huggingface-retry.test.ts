/** Hub reads ride the download path's retry policy (audit D3-13). */

import { HfError, searchModels } from "../huggingface";

type FetchStep = () => Response;

const realFetch = globalThis.fetch;

/** Installs a scripted fetch plus fake timers: every backoff is real time
 *  otherwise (1s, 2s, 4s), which no test should have to sit through. */
function installFetch(steps: FetchStep[]): { calls: () => number } {
  let calls = 0;
  jest.useFakeTimers();
  globalThis.fetch = (async () => {
    const step = steps[Math.min(calls, steps.length - 1)];
    calls += 1;
    return step();
  }) as typeof fetch;
  return { calls: () => calls };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const okRow = { modelId: "acme/tiny", downloads: 3 };

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

describe("searchModels retry policy", () => {
  it("retries a 503 and returns the body from the eventual success", async () => {
    const fetcher = installFetch([() => json({}, 503), () => json([okRow])]);

    const pending = searchModels("tiny");
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({ results: [{ modelId: "acme/tiny" }] });
    expect(fetcher.calls()).toBe(2);
  });

  it("honours Retry-After over its own backoff curve", async () => {
    const fetcher = installFetch([
      () => json({}, 429, { "Retry-After": "7" }),
      () => json([okRow]),
    ]);

    const pending = searchModels("tiny");
    // 6s of the server-dictated 7s: still waiting, so not a second call yet.
    await jest.advanceTimersByTimeAsync(6_000);
    expect(fetcher.calls()).toBe(1);
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({ results: [{ modelId: "acme/tiny" }] });
    expect(fetcher.calls()).toBe(2);
  });

  it("gives up after three attempts and throws the fallback", async () => {
    const fetcher = installFetch([() => json({}, 500)]);

    const pending = searchModels("tiny");
    const assertion = expect(pending).rejects.toThrow("Search failed");
    await jest.advanceTimersByTimeAsync(1_000 + 2_000);

    await assertion;
    expect(fetcher.calls()).toBe(3);
  });

  it("never retries a 404", async () => {
    const fetcher = installFetch([() => json({}, 404)]);

    await expect(searchModels("tiny")).rejects.toBeInstanceOf(HfError);
    expect(fetcher.calls()).toBe(1);
  });

  it("still reports 401 as an auth failure rather than a retry", async () => {
    const fetcher = installFetch([() => json({}, 401)]);

    await expect(searchModels("tiny")).rejects.toMatchObject({ code: "authentication" });
    expect(fetcher.calls()).toBe(1);
  });

  it("names the connection when the request never reaches the Hub", async () => {
    installFetch([
      () => {
        throw new TypeError("Network request failed");
      },
    ]);

    // A bare "Search failed" leaves the user guessing; this is the one
    // failure whose fix is on their side of the air gap.
    await expect(searchModels("tiny")).rejects.toMatchObject({
      code: "network",
      message: "Search failed — check your connection",
    });
  });
});