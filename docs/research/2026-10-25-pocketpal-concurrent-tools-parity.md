# PocketPal #999 parity: concurrent tool calls + tool cancellation

Date: 2026-10-25
Source: PocketPal commit `aad09f8a` ("Run tool calls concurrently", #999)
Status: ported and verified. Plan item 3 of
`docs/plans/pocketpal-new-release-parity.md`.

## What the commit does

One assistant reply can name several tool calls. PocketPal now:

1. emits a `tool_call_started` for **every** call before dispatching any,
2. dispatches them in one pass, at most **4 in flight**,
3. emits `tool_call_finished`, steps and blocks in **call order**, regardless of
   network order,
4. waits for every started call before the reply continues,
5. owns an `AbortSignal` per run: Stop aborts in-flight requests (including the
   429 wait), and queued calls are resolved as `cancelled` without dispatching,
6. keeps the search 429 retry (one retry, ≤2 s hint) and the in-flight dedupe.

## What LiAI already had

`services/agent/search.ts` already carried PocketPal's transport rules from the
earlier search port: one 429 retry with `Retry-After` / `x-ratelimit-reset` /
`ratelimit-reset` hints, the 2 s ceiling, no retry on 4xx/5xx/network/timeout,
abortable wait, `credentials: "omit"`, 12 s deadline, 2 MB cap.
`services/agent/search-budget.ts` already had `cacheKey` + hit cache and
`services/agent/registry.ts` the `inFlight` map for identical concurrent
queries. Those were **not rewritten**; this port adds the signal and the tests
that pin the whole matrix.

## What was ported

| Concern | Where |
|---|---|
| Start-first, cap-4 dispatch, call-order settle | `services/agent/runner.ts` |
| Runner-owned `AbortController`, caller signal only switches it on | `runner.ts` (`AgentRunOptions.signal`) |
| Abort → `engine.stopCompletion` while a completion is outstanding | `runner.ts` (`pendingCompletion`) |
| Queued calls resolved as `\<name\>: cancelled`, `ok: false` | `runner.ts` (`cancelledOutcome`) |
| Abort break after the tool phase + `run_finished`, `finally` aborts and `Promise.allSettled(started)` | `runner.ts` |
| Signal through the talent seam | `registry.ts` (`TalentContext.signal`) → `searchWeb` / `readPage` |
| Signal on every search fetcher and reader (trailing optional arg) | `services/agent/search.ts` |
| Signal per turn in the store, Stop and conversation-abandon abort it | `store/chat/send.ts`, `store/chat/types.ts` (`TurnPaths.signal`); `sessions.ts`'s existing `cancelActive` slot is what they cancel |
| Signal into the agent run | `services/chat/turn.ts` |

`stop()` already stopped the engine from the store; the runner-side translation
is what makes the OTHER abort path (abandoning the conversation, which never
called `stopEngine`) halt the decode instead of leaving llama.rn generating
behind a view that is gone.

The store now sets `ctx.active.handle` for the life of a turn (the slot
`sessions.ts` already cancelled) and clears it only when it still owns it, so a
newer turn's handle is never stomped. A turn started after a Stop mints a fresh
controller.

## Deliberate divergences

- **Functions, not provider classes.** PocketPal's `provider.search(query, opts,
  signal)` becomes a trailing optional `signal` argument on each
  `tavilySearch` / `braveSearch` / … and on `readPage`. Same seam, no class
  wrapper invented for parity's sake.
- **No live `tool_call_finished` writes in the store.** PocketPal's generator +
  hook model publishes each settled call as it lands. LiAI settles steps and
  blocks at the result boundary, and the store has no live tool-row write path;
  a live row is a separate UI feature, not part of this port.
- **A stopped turn's bubble keeps its partial text, not its cancelled steps.**
  `stop()` bumps the stream generation, so the unwinding run's result is
  discarded by the store's generation guard. `services/chat/turn.ts` still
  persists the partial reply AND the cancelled steps, so they appear when the
  conversation is reloaded; the live bubble does not receive them. PocketPal's
  hook keeps the cancelled rows on screen because its reducer owns the step
  list — the mirror of the previous divergence.

## Cancelled-call semantics

- Content: `` `${call.name || "Unknown talent (no function name)"}: cancelled` ``,
  `ok: false`, still one step per call so the model's tool messages match the
  assistant's `tool_calls`.
- A stopped run returns partial text and the cancelled steps; it never asks the
  model for a forced final answer.
- `read_url` / search cancellation surfaces as the usual failed outcome
  (`web_search: cancelled`), never a throw.

## Tests

| Suite | Pins |
|---|---|
| `services/agent/__tests__/runner.test.ts` | starts before dispatch, cap 4, call-order finishes, single-call baseline, stop before the tool phase, stop mid-tool, abort mid-completion stops the engine |
| `store/__tests__/chat-store.test.ts` ("tool cancellation") | Stop aborts the turn signal, abandoning the conversation aborts it, next turn gets a fresh signal |
| `services/chat/__tests__/local-turn.test.ts` | the turn forwards its signal: a stopped run persists cancelled steps |
| `services/agent/__tests__/search-cancellation.test.ts` | all six searches and all three readers abort with `cancelled`; all resolve without a signal |
| `services/agent/__tests__/search.test.ts` ("429 retry (PocketPal #999 matrix)") | full hint matrix under fake timers, retry-error propagation, abort during the wait, abort as the 429 arrives, no retry on 500/503/network/timeout, listener + timer cleanup, own signal, `credentials: "omit"`, search retries once where reads never do |
| `services/agent/__tests__/registry-web-search.test.ts` | a cancelled search caches and allowlists nothing and leaves no dead in-flight entry; identical concurrent queries still share one request |

Results: `npm run typecheck` clean; `npm test` 97 suites / 913 tests green.

## Deferred / follow-up

- Live tool rows (`tool_call_finished` before the result boundary) and live
  cancelled steps in the bubble — separate UI feature; the rows are persisted
  either way.
- Dedupe shares the FIRST caller's signal, exactly as the reference does
  (`WebSearchEngine.ts:87`). A waiting turn in another run cannot cancel the
  originator's request; if that originator stops, the waiter sees
  `web_search: cancelled`. Same behaviour, not fixed here.
- Device check that Stop lands during long streams is unchanged from
  `startStreamYield`'s existing caveat.
