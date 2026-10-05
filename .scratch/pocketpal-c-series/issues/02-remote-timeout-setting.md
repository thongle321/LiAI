# Make the remote request timeout configurable

**Gap:** C5
**Status:** ready-for-agent
**Blocked by:** none

`lib/inference/remote-engine.ts:22` hardcodes `DEFAULT_TIMEOUT_MS = 120_000`. The mechanism already exists (AbortController + setTimeout, cleared in `finally`, `:94-95`), and `store/chat/index.ts:152` passes no `timeoutMs`.

**The port is unnecessary.** PocketPal implements this over XHR with a connection timer plus a per-chunk idle timer (`openai.ts:503-524`); LiAI uses `fetch` + `AbortController`. This is a UI + persistence gap only.

## Acceptance

- The value is settable per remote provider and persists.
- Empty / unset means "use the default", not zero.
- Non-positive and non-finite input cannot be stored.
- The engine receives the stored value; a completed turn is unaffected.
- A test asserts the value actually reaches the abort timer — the existing timeout path has no test today.

## Files

`lib/inference/remote-engine.ts`, `components/models/RemoteModelSheet.tsx`, `types/models.ts`.

## Notes

Decision point: one decision point for the rule. `RemoteEngineOptions.timeoutMs` is already the seam.

## Decision (recorded)

**The configurable setting shipped (faf0354); the two-timer structure was
re-evaluate after the parity fact-check and lands as an evaluated NO-OP.**
(Fact-check follow-up, 2026-10-06 — "implement all findings to code"
round.)

- LiAI's remote engine is **non-streaming**: `remote-engine.ts` awaits the
  whole JSON body and emits the reply as one token. PocketPal's
  `IDLE_TIMEOUT_MS` pair exists *because* responses stream — it resets per
  SSE chunk (`openai.ts:600,679`), so there is literally nothing on our
  side for it to space.
- PocketPal's `CONNECTION_TIMEOUT_MS = 30000` cannot be ported either:
  on a non-streaming path headers can arrive only after generation
  completes, so a 30-second connection timer would abort every legitimate
  long reply. One overall deadline (`remote-engine.ts:95`, 120 s default)
  **is** the correct non-streaming equivalent of their pair.
- The remaining delta — their silent invalid-value drop vs our form error —
  already matches in effect: neither ever stores a bad value.

No code change; this block IS the deliverable.
