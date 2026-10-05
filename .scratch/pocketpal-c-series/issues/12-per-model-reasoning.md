# Per-model thinking capability with an override

**Gap:** C6
**Status:** ready-for-agent
**Blocked by:** none


Largest behavioural change in the set.

`thinkingEnabled` (`store/inference.ts:49`) is a single boolean defaulting `true`. `local-engine.ts:147,154-155` sends `reasoning_format: "auto"` and `enable_thinking` unconditionally, so **a non-reasoning model still receives `enable_thinking: true`**. `ModelSpec.capabilities` (`types/models.ts:51`) is a free-form `string[]` that nothing derives reasoning from.

PocketPal resolves capability on two axes with provenance `user > learned > detected > unknown` (`reasoningCapability.ts:70-103`).

## Acceptance

- Thinking is per model, not one global flag.
- A model known **not** to reason does not receive `enable_thinking: true`.
- **Default behaviour is unchanged** for every model that has never been classified. This is the critical constraint — the discriminant is what makes it assertable.
- An explicit user override wins over anything inferred, and is never clobbered by a plain settings save.
- The composer toggle reflects the resolved capability for the active model, not a global.
- Absent capability renders the toggle as today rather than hiding it.

## Files

`store/inference.ts`, `lib/inference/local-engine.ts`, `lib/chat/turn.ts`, `types/models.ts`, `components/chat/MessageInput.tsx`.

## Notes

Decide in this ticket whether capability is a store field or derived from `ModelSpec.capabilities` — the latter is currently an untyped `string[]` and leaning on it needs a schema decision. Do **not** port PocketPal's graded effort cycle; LiAI's on/off toggle is a deliberate divergence (D-doc §3). Risk: this changes what is sent to the engine on every turn, so the unchanged-default case needs a test, not a code read.

## Decision (recorded)

**Both, on two axes** — capability detection is a **typed store field**, user intent is a **store field next to the global it replaces**:

- `ModelSpec.reasoning?: boolean` (types/models.ts) — the schema decision: an explicit tri-state field (`true` / `false` / absent = unknown) instead of parsing the free-form `capabilities` string[]. Hydration carries it through the model-upgrade whitelist. Nothing populates it yet — absence is what guarantees the critical acceptance.
- `thinkingOverrides: Record<string, boolean>` in the inference store — the user axis. Its setter merge-patches like every other setter, and `persist()` serializes current state, so no plain settings save can clobber it (asserted).
- Resolver `lib/inference/thinking.ts#resolveThinking`: **user > detected > global** (PocketPal's provenance minus `learned` — LiAI has no stream-learning). Both the turn (`defaultThinking`) and the composer pill resolve through it; the pill always writes the per-model override when a model is active, so thinking is per-model from the first press, while the global stays the default for untouched models.
- Deliberately not built: graded effort (D-doc §3), stream-learning provenance, capability population data.
- Stale premises in this issue: `local-engine` already sends `enable_thinking` only when the request carries it (conditional spread), and the turn already threads a boolean — no change was needed in `local-engine.ts` or `turn.ts`.
