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
