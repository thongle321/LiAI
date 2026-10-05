# Show per-tool-call token and time cost

**Gap:** C15
**Status:** ready-for-agent
**Blocked by:** none

Confirmed absent. PocketPal renders `1,500 tokens · 35s` beneath a tool result (`ToolMetricsFooter.tsx:28`), captured per call across its arguments (`AgentRunner.ts:422`).

LiAI already surfaces timing in the turn footer (`MessageActions.tsx:118-148`), so this is a **placement** question rather than missing data.

## Acceptance

- Each tool call shows its own token and elapsed cost.
- Renders nothing when tokens are 0 — absence of metrics is itself the cue.
- Metrics live under the result surface, not in the turn footer, so per-tool cost is attributable.
- Available to the sheet surfaces in `toolSurfaces.tsx` as well as the static chip.

## Files

`components/chat/toolSurfaces.tsx`, `components/chat/MessageListItem.tsx`, `lib/agent/runner.ts`, `lib/chat/tinybase-store.ts`.

## Notes

Requires persisting per-call metrics on `toolRuns` — an additive column, where old rows simply read as no metrics (the same pattern ticket 01 of G5 used). G5's spec deliberately deferred this because timing lived in the turn footer; that reasoning is now worth revisiting explicitly rather than inheriting.
