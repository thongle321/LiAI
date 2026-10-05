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
