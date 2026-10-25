/** Agent runner: concurrent tool calls, call-order outcomes (PocketPal #999). */

import type {
  CompletionEngine,
  EngineToolCall,
} from "@/services/inference/engine.ts";
import { deriveToolSchemas } from "../registry.ts";
import { resetSearchCache } from "../search-budget.ts";
import { runLocalAgent, type AgentEvent } from "../runner.ts";

const AUTH = { provider: "brave", key: "k", count: 5 };

beforeEach(() => {
  resetSearchCache();
});

function call(id: string, name: string, args: Record<string, unknown>): EngineToolCall {
  return { id, name, arguments: JSON.stringify(args) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Engine that asks for `calls` on its first turn, then answers "done". */
function toolCallEngine(
  calls: EngineToolCall[],
  onFirst?: () => void,
): CompletionEngine {
  let turn = 0;
  return {
    completion: async (_request, cbs) => {
      turn += 1;
      if (turn === 1) {
        onFirst?.();
        return {
          text: "",
          toolCalls: calls,
          promptTokens: 1,
          completionTokens: 1,
          stoppedEarly: false,
        };
      }
      cbs.onToken("done");
      return {
        text: "done",
        toolCalls: [],
        promptTokens: 2,
        completionTokens: 1,
        stoppedEarly: false,
      };
    },
    stopCompletion: async () => {},
  };
}

function braved(title: string): Response {
  return new Response(
    JSON.stringify({
      type: "search",
      web: {
        results: [{ title, url: `https://hit.example/${title}`, description: "d" }],
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

const asFetch = (impl: (url: string) => Promise<Response>): typeof fetch =>
  ((url: string) => impl(String(url))) as unknown as typeof fetch;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function queryOf(url: string): string {
  return new URL(url).searchParams.get("q") ?? "";
}

async function run(
  engine: CompletionEngine,
  fetchImpl: typeof fetch,
  events: AgentEvent[] = [],
  signal?: AbortSignal,
) {
  return runLocalAgent({
    engine,
    messages: [{ role: "user", content: "hi" }],
    tools: deriveToolSchemas(["web_search"]),
    fetchImpl,
    search: AUTH,
    ...(signal ? { signal } : {}),
    onEvent: (event) => events.push(event),
  });
}

const sixSearches = (): EngineToolCall[] =>
  Array.from({ length: 6 }, (_, i) =>
    call(`c${i}`, "web_search", { query: `q${i}` }),
  );

describe("runLocalAgent tool calls", () => {
  it("starts every call before dispatching and finishes them in call order", async () => {
    const alpha = deferred<Response>();
    const beta = deferred<Response>();
    const fetched: string[] = [];
    const fetchImpl = asFetch(async (url) => {
      const query = queryOf(url);
      fetched.push(query);
      return query === "alpha" ? alpha.promise : beta.promise;
    });
    const events: AgentEvent[] = [];

    const result = run(
      toolCallEngine([
        call("c1", "web_search", { query: "alpha" }),
        call("c2", "web_search", { query: "beta" }),
      ]),
      fetchImpl,
      events,
    );

    // Both calls are in flight before either finishes.
    await flush();
    expect(fetched).toEqual(["alpha", "beta"]);
    expect(events.filter((e) => e.type === "tool_call_started")).toHaveLength(2);
    expect(events.some((e) => e.type === "tool_call_finished")).toBe(false);

    // The SECOND call settles first; its outcome still waits for the first.
    beta.resolve(braved("Beta"));
    await flush();
    expect(events.some((e) => e.type === "tool_call_finished")).toBe(false);

    alpha.resolve(braved("Alpha"));
    const out = await result;

    const started = events.filter((e) => e.type === "tool_call_started");
    const finished = events
      .filter((e) => e.type === "tool_call_finished")
      .map((e) => (e.type === "tool_call_finished" ? e.outcome.callId : ""));
    expect(started.map((e) => (e.type === "tool_call_started" ? e.call.id : ""))).toEqual([
      "c1",
      "c2",
    ]);
    expect(finished).toEqual(["c1", "c2"]);
    expect(out.steps.map((s) => s.id)).toEqual(["c1", "c2"]);
    expect(out.steps[0].result).toContain("Alpha");
    expect(out.steps[1].result).toContain("Beta");
    expect(out.text).toBe("done");
  });

  it("runs at most four calls of one reply at once", async () => {
    const pending = Array.from({ length: 5 }, () => deferred<Response>());
    const fetched: string[] = [];
    const fetchImpl = asFetch(async (url) => {
      const query = queryOf(url);
      fetched.push(query);
      return pending[fetched.length - 1].promise;
    });

    const result = run(
      toolCallEngine(
        Array.from({ length: 5 }, (_, i) =>
          call(`c${i}`, "web_search", { query: `q${i}` }),
        ),
      ),
      fetchImpl,
    );

    await flush();
    expect(fetched).toEqual(["q0", "q1", "q2", "q3"]);

    pending[0].resolve(braved("Q0"));
    await flush();
    expect(fetched).toEqual(["q0", "q1", "q2", "q3", "q4"]);

    for (let i = 1; i < pending.length; i += 1) pending[i].resolve(braved(`Q${i}`));
    const out = await result;
    expect(out.steps.map((s) => s.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("keeps a single call's step and finish event unchanged", async () => {
    const events: AgentEvent[] = [];
    const out = await run(
      toolCallEngine([call("c1", "web_search", { query: "solo" })]),
      asFetch(async () => braved("Solo")),
      events,
    );
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].ok).toBe(true);
    expect(events.filter((e) => e.type === "tool_call_finished")).toHaveLength(1);
  });

  it("cancels every call, without dispatching, when the run is stopped before the tool phase", async () => {
    const controller = new AbortController();
    let fetches = 0;
    const fetchImpl = asFetch(async () => {
      fetches += 1;
      return braved("never");
    });
    const events: AgentEvent[] = [];

    const out = await run(
      toolCallEngine(sixSearches(), () => controller.abort()),
      fetchImpl,
      events,
      controller.signal,
    );

    expect(fetches).toBe(0);
    expect(out.steps).toHaveLength(6);
    expect(out.steps.every((s) => s.ok === false)).toBe(true);
    expect(out.steps.map((s) => s.result)).toEqual(
      Array(6).fill("web_search: cancelled"),
    );
    expect(out.text).toBe("");
    expect(
      events.filter((e) => e.type === "tool_call_finished").map((e) =>
        e.type === "tool_call_finished" ? e.outcome.callId : "",
      ),
    ).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
  });

  it("stops the engine when the turn is aborted mid-completion", async () => {
    // The runner is the one layer holding both the signal and the engine,
    // so abandoning the conversation must reach stopCompletion from here —
    // otherwise the model keeps decoding behind a view that is gone.
    const controller = new AbortController();
    let stops = 0;
    let release!: (outcome: {
      text: string;
      toolCalls: EngineToolCall[];
      promptTokens: number;
      completionTokens: number;
      stoppedEarly: boolean;
    }) => void;
    const engine: CompletionEngine = {
      completion: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      stopCompletion: async () => {
        stops += 1;
      },
    };

    const pending = run(engine, asFetch(async () => braved("never")), [], controller.signal);
    await flush();
    controller.abort();
    expect(stops).toBe(1);

    release({
      text: "par",
      toolCalls: [],
      promptTokens: 1,
      completionTokens: 1,
      stoppedEarly: false,
    });
    const out = await pending;
    expect(out.text).toBe("par");
    expect(stops).toBe(1);
  });

  it("aborts in-flight calls and cancels the queued ones when stopped mid-tool", async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      started.push(queryOf(String(url)));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")));
      });
    }) as unknown as typeof fetch;
    let completions = 0;
    const engine = toolCallEngine(sixSearches());
    const counting: CompletionEngine = {
      completion: (request, callbacks) => {
        completions += 1;
        return engine.completion(request, callbacks);
      },
      stopCompletion: async () => {},
    };

    const pending = run(counting, fetchImpl, [], controller.signal);
    await flush();
    expect(started).toEqual(["q0", "q1", "q2", "q3"]);

    controller.abort();
    const out = await pending;

    expect(completions).toBe(1);
    expect(started).toEqual(["q0", "q1", "q2", "q3"]);
    expect(out.steps).toHaveLength(6);
    expect(out.steps.map((s) => s.result)).toEqual(
      Array(6).fill("web_search: cancelled"),
    );
  });
});
