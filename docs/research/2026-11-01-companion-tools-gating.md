# Companion chat "empty reply": cause, fix, and one deliberate PocketPal divergence

Date: 2026-11-01. Scope: local engine only (the reporter tests local GGUF
models); the sibling record for the companion port itself is
`2026-10-18-store-db-companions-parity.md`.

## Symptom

A chat bound to a companion (preset Pip or a custom one) failed instantly and
always with **"empty reply"**. Plain chat — no companion — worked. Local model.

## Why the message was useless

"empty reply" is LiAI's own sentence, not the engine's. `services/agent/runner.ts`
catches every completion failure (native throw, bad chat template, crashed
context) and resolves the run with `text: ""`, `steps: []`. `services/chat/turn.ts`
then turned that shape into `Error("empty reply")`, discarding the native
failure text that the runner had already captured for its `run_failed` event.

## Why only companions

The turn is otherwise identical; the companion changes exactly one thing: her
PACT talents become engine `tools` (`turn.ts` → `deriveToolSchemas`, faithful to
`pocketpal-ai/src/store/ChatSessionStore.ts:1535-1545`). Pip seeds all five
talents. A no-companion chat sends `tools: []`. A model whose chat template has
no slot for tool schemas can fail the engine call before emitting a token.

## Fix

1. **Unmasked the cause.** `AgentResult.error` carries the engine's own message
   out of both runner catches; `turn.ts` re-throws it instead of the generic
   sentence. `store/chat/send.ts`'s existing classifier
   (`utils/llama-rn-errors.ts`) can then recognise context-full /
   tool-args-parse / speculative-init and show the right notice.
2. **Gated the pact on the model's tool probe.** `callableTalentNames`
   (`services/chat/tool-compat.ts`) returns `[]` for a LOCAL model probed
   `supportsTools === false`, and the pact otherwise. Wired into
   `defaultTalentNames` (`store/chat/index.ts`). The companion keeps her
   system prompt and conversation; her talents' prompt fragments are derived
   from the same gated list, so they go with the schemas (a `web_search`
   fragment would describe a capability the turn cannot use), and
   `useToolCompatWarning` still explains why.

## The divergence (deliberate)

PocketPal **warns but still sends** the schemas
(`pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx:185-234`: a one-time
banner, no gating). LiAI **warns and withholds** them when the local probe says
the model cannot call tools. Reason: PocketPal's approach leaves the failure in
place on exactly the models the warning names, and LiAI's failure mode there is
a dead conversation rather than a degraded one. "Never probed"
(`supportsTools === undefined`) and remote providers keep the pact — an
unknown local verdict must not silently disable a capability, and the local
jinja probe says nothing about a server.

## Verified here vs not

- Node tests cover: runner error propagation, turn re-throw, the gate's four
  cases, and the editor's create/edit/write-failure/delete-failure contract.
- Not verified: the exact native string on the reporter's device. The fix is
  built so the bubble names it if it recurs (unmasking) and so a probed
  tool-less model never trips it (gating).
- Known limit: `supportsTools === undefined` keeps the pact, so the FIRST
  turn after a cold load of a tool-less model can still fail before the
  probe's verdict is persisted. That is the deliberate trade (an unknown
  verdict must not disable a capability), and from that point the gate holds.
- Known gap: the model-store read inside `defaultTalentNames` is not
  covered by a test — the resolver's dependencies are reached through
  dynamic imports, which jest's CJS runtime does not mock, so the wiring is
  covered by the pure gate's cases plus review rather than end to end.
