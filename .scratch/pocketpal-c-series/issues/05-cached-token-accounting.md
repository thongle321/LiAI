# Count cached and reused prompt tokens

**Gap:** C3
**Status:** ready-for-agent
**Blocked by:** none


BLOCKS: 07-near-limit-warning.

`tokens_cached` (native result) and the timings' `cache_n` are never read on either engine. The project's own spec admits it: *"We are dropping all of it on the floor"* (`docs/specs/2026-09-29-chat-turn-signals-and-lifecycle.md:30,36-37`). Remote `usage.prompt_tokens_details.cached_tokens` is likewise unread.

Effect: the context meter divides by `nCtx` using an under-reported occupancy, so a thread near the window limit can show a comfortable percentage.

PocketPal: `pocketpal-ai/src/api/servers/index.ts:334-346` (`readFinish`) — `tokensEvaluated = (prompt_n ?? 0) + (cache_n ?? 0)` (:341-344), each key guarded independently because "old build omits `cache_n`" and "cold prompt reports `0`" are different facts (comment at :326-333, the quotes at :330-331).

## Acceptance

- Occupancy reflects all tokens held against the window, not only re-processed ones.
- Each source key is guarded on its own — absence is never coerced to zero.
- Both the local engine and the remote engine are covered.
- The fill meter and the context banner both consume the corrected figure.

## Files

`lib/inference/local-engine.ts`, `lib/inference/remote-engine.ts`, `lib/chat/context-fill.ts`, `lib/inference/engine.ts`, `lib/agent/runner.ts`.

(Corrected by the parity fact-check: `types/models.ts` was listed but untouched —
the usage contract lives in `lib/inference/engine.ts`; `lib/agent/runner.ts` changed
but was not listed.)

## Notes

Open question from the spec, decide here: when `tokens_cached` and `cache_n` disagree, which is authoritative? Answer against the engine's own definition — do not guess.

## Decision (recorded)

**`tokens_cached` is authoritative.** It is llama.rn's `n_past` at completion
end (`JSICompletion.h:169/245`): prompt (reused + re-processed) plus generated,
shrunk by any context shift (`rn-completion.cpp:1028`) — i.e. exactly "tokens
held against the window", on both native paths. `cache_n` is path-dependent:
the legacy flow aliases it to that same `n_past` (`JSICompletion.h:181`), the
slot flow sets it to the reused prompt prefix only (`rn-slot.cpp:644`, defined
"prompt tokens from cache" at `rn-slot.h:23`). PocketPal's `prompt_n + cache_n`
is a llama-server WIRE formula (`pocketpal-ai/src/api/servers/index.ts:341-344`) — porting it here
would over-count on one path and miss generated tokens on the other. It is
therefore deliberately not read; occupancy falls back to `tokens_evaluated`
(prompt length) only when a build omits `tokens_cached`, and a reported `0` is
a fact, not absence.

Remote: `prompt_tokens` already includes the `cached_tokens` subset (OpenAI
contract) — never summed; `cached_tokens` is read as the independent fallback
when a server omits the total.
