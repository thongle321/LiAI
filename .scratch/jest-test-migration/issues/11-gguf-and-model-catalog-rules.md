Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 11 — GGUF metadata, memory estimation, and model catalog rules

`tests/legacy/gguf-metadata.test.legacy.ts` was one of the highest-value
retired guards and one of the cheapest to port: every module it exercises is
pure, with no native import and no injection seam.

Retired guards:

- `gguf-metadata` — `maxContextLength` architecture-prefixed key
  resolution, string coercion, `ggufMetadataFromHeader`,
  `estimateModelMemory`, `toMemoryMetadata`, `makeFitStatusFor`
  (`lib/models/gguf-metadata.ts`, `lib/models/memoryEstimator.ts`,
  `lib/models/context-fit.ts`).
- `context-ladder` / `context-fit` / `context-fill` /
  `context-banner-variants` — the context-size ladder, the fill percentage,
  and the banner copy the chat header shows (`lib/chat/context-ladder.ts`,
  `lib/chat/context-fit.ts`, `lib/chat/context-fill.ts`,
  `lib/chat/banner-variant.ts`).
- `model-groups`, `model-spec`, `model-upgrade`, `model-providers`,
  `model-settings-parity`, `card-actions`, `storage-fit`, `device-tiers` —
  catalog grouping, spec-id derivation, store upgrade migration, provider
  helpers, card actions and device-tier memory bounds.
- `hf-format`, `hf-token-use`, `hf-warnings`, `hf-direct`,
  `hf-search-race`, `hf-search-view`, `hf-details-sheet` — the Hugging Face
  surface, including search supersession.

## Acceptance

- [ ] `lib/models/__tests__/` gains gguf-metadata, memoryEstimator and
      context-fit behavior suites.
- [ ] `lib/chat/__tests__/` gains context-ladder / context-fill /
      banner-variant suites.
- [ ] The HF search surface has at least a fetch-injected behavior test for
      duplicate supersession and result mapping.
- [ ] `assets/device-tiers.json` invariants stay typed through
      `lib/models/device-tiers.ts` and are asserted, not scanned.

## Context pointers

- Production: `lib/models/gguf-metadata.ts`, `lib/models/memoryEstimator.ts`,
  `lib/models/context-fit.ts`, `lib/chat/context-ladder.ts`,
  `lib/models/huggingface.ts`, `lib/models/hf-format.ts`
- Retired guards: `git show HEAD~1:tests/legacy/gguf-metadata.test.legacy.ts`
- Spec: `.scratch/jest-test-migration/spec.md`
