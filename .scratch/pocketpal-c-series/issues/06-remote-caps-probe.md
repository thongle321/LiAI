# Probe a remote server's real capabilities

**Gap:** C7
**Status:** ready-for-agent
**Blocked by:** none


BLOCKS: 07-near-limit-warning.

`RemoteCaps` has exactly two fields, `reachable` and `checkedAt` (`types/models.ts:131-134`). There is no `/props` request, so no vision detection and no context-length discovery.

Already causing a defect: `remote-engine.ts:135-139` cannot distinguish a full context window from a server-side `max_tokens`, and therefore refuses to claim the context is full.

## Acceptance

- `/props` is fetched where the server type supports it.
- A failed probe resolves to **unknown**, never to "unsupported". A timeout, 401, non-2xx or malformed body must all degrade the same way.
- Context length and vision support are captured when present.
- A multi-model server answers per model, so a probe that describes no loaded model is discarded rather than believed.
- Probe results are keyed per model, not per server.
- Absent field merges field-wise; a known value is never blanked by a later probe.

## Files

`lib/models/remote-api.ts`, `types/models.ts`, `store/models/remote.ts`.

## Notes

PocketPal: `api/llamaServer/props.ts:70-125` (never throws) and `:100-104` (`describesModel` guard). Note the asymmetry — LiAI uses `fetch` + `AbortSignal.timeout` already, which is the right tool here. This is the highest-risk ticket in the set: it adds a live network request. Never let it throw into a turn.

## Decision (recorded)

**Vision on a body that describes its model but reports no `modalities`: UNKNOWN, not `false`.**

PocketPal writes `supportsVision = data?.modalities?.vision === true` inside its `describesModel` guard (`pocketpal-ai/src/api/llamaServer/props.ts:109`), so an absent `modalities` key resolves to a confident `false`. LiAI writes the field only when `modalities` is actually present (`lib/models/remote-api.ts`, the `asRecord` guard); silence leaves it absent.

Reasons to keep `unknown`:

1. Absence cannot distinguish "this model has no vision" from "this server never reports `modalities`" (an older llama.cpp build, or a non-standard `/props` shim). `false` would be a terminal, wrong belief for a vision model behind such a server — nothing could re-probe it.
2. It is RemoteCaps' own invariant (`types/models.ts`): *an absent capability field means UNKNOWN, never coerced to false — "unsupported" is a claim a failed probe must not make.* A missing key is the same silence.
3. It costs nothing today: `supportsVision` has no consumer, and `unknown` and `false` block identically. A future consumer that needs a boolean coerces at the read site; only a consumer that wants to distinguish "unmeasured" from "measured-absent" gains anything from `false` — and it gains it only while the field stays unknown.

Recorded by the C-series parity fact-check (`docs/research/2026-10-06-pocketpal-c-series-parity-factcheck.md`, issue 06 = the single UNDECLARED divergence). Reopen this decision only when a consumer arrives that wants PocketPal's `false`.
