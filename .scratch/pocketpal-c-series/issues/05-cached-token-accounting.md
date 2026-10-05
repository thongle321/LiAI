# Count cached and reused prompt tokens

**Gap:** C3
**Status:** ready-for-agent
**Blocked by:** none


BLOCKS: 07-near-limit-warning.

`tokens_cached` (native result) and the timings' `cache_n` are never read on either engine. The project's own spec admits it: *"We are dropping all of it on the floor"* (`docs/specs/2026-09-29-chat-turn-signals-and-lifecycle.md:30,36-37`). Remote `usage.prompt_tokens_details.cached_tokens` is likewise unread.

Effect: the context meter divides by `nCtx` using an under-reported occupancy, so a thread near the window limit can show a comfortable percentage.

PocketPal: `servers/index.ts:334-345` — `tokensEvaluated = (prompt_n ?? 0) + (cache_n ?? 0)`, each key guarded independently because "old build omits `cache_n`" and "cold prompt reports `0`" are different facts.

## Acceptance

- Occupancy reflects all tokens held against the window, not only re-processed ones.
- Each source key is guarded on its own — absence is never coerced to zero.
- Both the local engine and the remote engine are covered.
- The fill meter and the context banner both consume the corrected figure.

## Files

`lib/inference/local-engine.ts`, `lib/inference/remote-engine.ts`, `lib/chat/context-fill.ts`, `types/models.ts`.

## Notes

Open question from the spec, decide here: when `tokens_cached` and `cache_n` disagree, which is authoritative? Answer against the engine's own definition — do not guess.
