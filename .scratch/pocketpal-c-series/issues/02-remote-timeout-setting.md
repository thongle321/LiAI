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
